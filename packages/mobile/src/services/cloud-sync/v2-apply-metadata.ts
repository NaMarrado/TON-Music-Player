import type { CloudLibraryManifestV2, CloudPlaylistRecordV2, CloudTrackRecordV2 } from '@ton/core';
import { getDb } from '../database';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { loadPlaylists, reloadLoadedPlaylistDetails } from '../../stores/playlist-store';
import { getMobileCloudProtectedEntities, withMobileCloudOutboxSuppressed } from './local-state';
import { fileExists } from './v1-common';
import { resolveAvailablePlaylistTrackIds } from './playlist-memberships';
import { normalizeDownloadedAt, throwIfAborted } from './v2-common';
import { applyTombstones } from './v2-tombstones';

type ExistingTrack = {
  id: number;
  content_hash_sha256: string;
  downloaded_at: number | null;
  cover_art_path: string | null;
};

async function collectMissingAssets(
  scopeId: string,
  liveTracks: Array<Extract<CloudTrackRecordV2, { deleted: false }>>,
  livePlaylists: Array<Extract<CloudPlaylistRecordV2, { deleted: false }>>,
  existingByHash: Map<string, ExistingTrack>,
  signal?: AbortSignal,
): Promise<number> {
  const rows = await getDb().getAllAsync<{
    entity_type: 'track' | 'playlist'; entity_key: string; record_json: string;
  }>('SELECT entity_type, entity_key, record_json FROM cloud_sync_entities WHERE scope_id = ?', [scopeId]);
  const previous = new Map(rows.map((row) => [`${row.entity_type}:${row.entity_key}`, row.record_json]));
  const missing = new Set<string>();
  for (const record of liveTracks) {
    const hash = record.entry.artwork_hash_sha256;
    const local = existingByHash.get(record.content_hash_sha256);
    if (!hash || !local) continue;
    let previousHash: string | null = null;
    try {
      const raw = previous.get(`track:${record.content_hash_sha256}`);
      const parsed = raw ? JSON.parse(raw) as CloudTrackRecordV2 : null;
      previousHash = parsed && !parsed.deleted ? parsed.entry.artwork_hash_sha256 : null;
    } catch { previousHash = null; }
    if (previousHash !== hash || !(await fileExists(local.cover_art_path))) missing.add(hash);
    throwIfAborted(signal);
  }
  const playlistRows = await getDb().getAllAsync<{ cloud_id: string; cover_path: string | null }>(
    `SELECT cloud_id, cover_path FROM playlists WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
  );
  const playlistsById = new Map(playlistRows.map((row) => [row.cloud_id, row]));
  for (const record of livePlaylists) {
    const hash = record.entry.cover_hash_sha256;
    if (!hash) continue;
    let previousHash: string | null = null;
    try {
      const raw = previous.get(`playlist:${record.cloud_id}`);
      const parsed = raw ? JSON.parse(raw) as CloudPlaylistRecordV2 : null;
      previousHash = parsed && !parsed.deleted ? parsed.entry.cover_hash_sha256 : null;
    } catch { previousHash = null; }
    if (previousHash !== hash || !(await fileExists(playlistsById.get(record.cloud_id)?.cover_path))) {
      missing.add(hash);
    }
    throwIfAborted(signal);
  }
  return missing.size;
}

export async function applyManifestWithoutAudio(
  manifest: CloudLibraryManifestV2,
  scopeId: string,
  afterGeneration: number,
  signal?: AbortSignal,
): Promise<{ pendingDownloads: number; pendingAssets: number }> {
  throwIfAborted(signal);
  await applyTombstones(manifest, { scopeId, afterGeneration }, signal);
  const liveTracks = manifest.tracks.filter(
    (record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted,
  );
  const livePlaylists = manifest.playlists.filter(
    (record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted,
  );
  const existing = await getDb().getAllAsync<ExistingTrack>(
    `SELECT id, content_hash_sha256, downloaded_at, cover_art_path FROM tracks
     WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''`,
  );
  const existingByHash = new Map(existing.map((row) => [row.content_hash_sha256, row]));
  const existingIdByHash = new Map(existing.map((row) => [row.content_hash_sha256, row.id]));
  const pendingDownloads = liveTracks.reduce(
    (count, record) => count + (existingByHash.has(record.content_hash_sha256) ? 0 : 1), 0,
  );
  const pendingAssets = await collectMissingAssets(
    scopeId, liveTracks, livePlaylists, existingByHash, signal,
  );

  await withMobileCloudOutboxSuppressed(async (db) => {
    const protectedEntities = await getMobileCloudProtectedEntities(
      scopeId, afterGeneration, db,
    );
    for (const record of liveTracks) {
      throwIfAborted(signal);
      if (protectedEntities.trackHashes.has(record.content_hash_sha256)) continue;
      const row = existingByHash.get(record.content_hash_sha256);
      if (!row) continue;
      const entry = record.entry;
      const remoteAt = normalizeDownloadedAt(entry.downloaded_at);
      const localAt = normalizeDownloadedAt(row.downloaded_at);
      const downloadedAt = remoteAt && localAt ? Math.min(remoteAt, localAt) : remoteAt ?? localAt;
      await db.runAsync(
        `UPDATE tracks SET
          title = ?, artist = ?, album = ?, album_artist = ?, track_number = ?,
          disc_number = ?, duration_ms = ?, genre = ?, year = ?, bitrate = ?,
          sample_rate = ?, file_size = ?, format = ?, loudness_lufs = ?, loudness_gain = ?,
          youtube_id = ?, spotify_id = ?, soundcloud_id = ?, source_url = ?, rating = ?,
          added_at = ?, downloaded_at = ?, cover_art_path = CASE WHEN ? = 1 THEN NULL ELSE cover_art_path END,
          in_library = 1 WHERE id = ?`,
        [
          entry.metadata.title, entry.metadata.artist, entry.metadata.album,
          entry.metadata.album_artist, entry.metadata.track_number, entry.metadata.disc_number,
          entry.metadata.duration_ms, entry.metadata.genre, entry.metadata.year,
          entry.metadata.bitrate, entry.metadata.sample_rate, entry.file_size, entry.format,
          entry.metadata.loudness_lufs, entry.metadata.loudness_gain, entry.youtube_id,
          entry.spotify_id, entry.soundcloud_id, entry.source_url, entry.metadata.rating,
          entry.added_at, downloadedAt, entry.artwork_hash_sha256 == null ? 1 : 0, row.id,
        ],
      );
    }
    for (const record of livePlaylists) {
      throwIfAborted(signal);
      if (protectedEntities.playlistCloudIds.has(record.cloud_id)) continue;
      const entry = record.entry;
      await db.runAsync(
        `INSERT INTO playlists(
          cloud_id, name, description, is_smart, smart_rules, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_id) DO UPDATE SET
          name = excluded.name, description = excluded.description,
          cover_path = CASE WHEN ? = 1 THEN NULL ELSE playlists.cover_path END,
          is_smart = excluded.is_smart, smart_rules = excluded.smart_rules,
          sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
        [
          entry.cloud_id, entry.name, entry.description, entry.is_smart ? 1 : 0,
          entry.smart_rules, entry.sort_order, entry.created_at, entry.updated_at,
          entry.cover_hash_sha256 == null ? 1 : 0,
        ],
      );
      const playlist = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM playlists WHERE cloud_id = ?', [entry.cloud_id],
      );
      if (!playlist) continue;
      await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlist.id]);
      const trackIds = resolveAvailablePlaylistTrackIds(
        entry.track_hashes, existingIdByHash,
      );
      for (let position = 0; position < trackIds.length; position += 1) {
        await db.runAsync(
          'INSERT INTO playlist_tracks(playlist_id, track_id, position) VALUES (?, ?, ?)',
          [playlist.id, trackIds[position], position],
        );
      }
    }
  });
  await Promise.all([
    reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
    loadPlaylists(),
  ]);
  await reloadLoadedPlaylistDetails();
  throwIfAborted(signal);
  return { pendingDownloads, pendingAssets };
}
