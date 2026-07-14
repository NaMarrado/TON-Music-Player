import path from 'node:path';
import type {
  CloudLibraryManifestV2,
  CloudPlaylistRecordV2,
  CloudSyncResult,
  CloudTrackRecordV2,
} from '@ton/core';
import { getDb } from '../database';
import { getArtworkDir } from '../metadata-reader/artwork';
import { setDesktopCloudOutboxSuppressed } from './auto-sync-store';
import { DesktopR2Client } from './r2-client';
import { pathExists } from './sync-common';
import { readCloudApplyProtection } from './v2-apply-protection';
import { downloadVerifiedCloudFile } from './v2-files';
import { throwIfV2Cancelled, type CloudMirrorRow, type V2SyncOptions } from './v2-types';

type PlaylistApplyInput = {
  client: DesktopR2Client;
  scopeId: string;
  manifest: CloudLibraryManifestV2;
  result: CloudSyncResult;
  options: V2SyncOptions;
  capturedGeneration: number;
  mirrorRows: CloudMirrorRow[];
  playlistMirror: Map<string, string>;
  changedTrackRecords: CloudTrackRecordV2[];
  changedTrackHashes: Set<string>;
  trackIdByHash: Map<string, number>;
};

export async function applyCloudPlaylistsV2(input: PlaylistApplyInput): Promise<void> {
  const {
    client, scopeId, manifest, result, options, capturedGeneration,
    mirrorRows, playlistMirror, changedTrackRecords, changedTrackHashes, trackIdByHash,
  } = input;
  const db = getDb();
  const recordChanged = (record: CloudPlaylistRecordV2) => (
    options.force
    || playlistMirror.get(record.cloud_id) !== JSON.stringify(record)
    || (!record.deleted && record.entry.track_hashes.some((hash) => changedTrackHashes.has(hash)))
  );
  const changedPlaylistRecords = manifest.playlists.filter(recordChanged);
  let protection = readCloudApplyProtection(scopeId, capturedGeneration);
  const trackIsProtected = (hash: string) => protection.protectAll || protection.trackHashes.has(hash);
  const playlistIsProtected = (cloudId: string) => (
    protection.protectAll || protection.playlistCloudIds.has(cloudId)
  );
  const recordsToApply = changedPlaylistRecords.filter((record) => !playlistIsProtected(record.cloud_id));
  const queueBlobGc = db.prepare(`
    INSERT INTO cloud_sync_blob_gc (scope_id, object_key, eligible_at) VALUES (?, ?, ?)
    ON CONFLICT(scope_id, object_key) DO UPDATE SET
      eligible_at = MAX(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)
  `);
  const cancelBlobGc = db.prepare(
    'DELETE FROM cloud_sync_blob_gc WHERE scope_id = ? AND object_key = ?',
  );
  const gcEligibleAt = Date.now() + 30 * 24 * 60 * 60 * 1_000;
  for (const record of recordsToApply) {
    if (!record.deleted) {
      if (record.entry.cover_object_key) cancelBlobGc.run(scopeId, record.entry.cover_object_key);
      continue;
    }
    const previousJson = playlistMirror.get(record.cloud_id);
    if (!previousJson) continue;
    try {
      const previous = JSON.parse(previousJson) as CloudPlaylistRecordV2;
      if (!previous.deleted && previous.entry.cover_object_key) {
        queueBlobGc.run(scopeId, previous.entry.cover_object_key, gcEligibleAt);
      }
    } catch {
      // A malformed local mirror must not prevent applying the tombstone.
    }
  }
  throwIfV2Cancelled(options);
  setDesktopCloudOutboxSuppressed(() => {
    db.transaction(() => {
      for (const record of recordsToApply) {
        if (record.deleted) db.prepare('DELETE FROM playlists WHERE cloud_id = ?').run(record.cloud_id);
      }
    })();
  });

  const livePlaylists = recordsToApply.filter(
    (record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted,
  );
  const downloadedCovers = new Map<string, string | null>();
  for (const record of livePlaylists) {
    throwIfV2Cancelled(options);
    const entry = record.entry;
    let coverPath: string | null = null;
    if (entry.cover_object_key && entry.cover_hash_sha256) {
      const coverExt = path.extname(entry.cover_object_key) || '.jpg';
      coverPath = path.join(getArtworkDir(), `${entry.cover_hash_sha256}${coverExt}`);
      if (!(await pathExists(coverPath))) {
        await downloadVerifiedCloudFile(
          client, entry.cover_object_key, coverPath, entry.cover_hash_sha256, options.signal,
        );
      }
    }
    throwIfV2Cancelled(options);
    downloadedCovers.set(entry.cloud_id, coverPath);
  }

  protection = readCloudApplyProtection(scopeId, capturedGeneration);
  const finalLivePlaylists = livePlaylists.filter((record) => !playlistIsProtected(record.cloud_id));
  setDesktopCloudOutboxSuppressed(() => {
    db.transaction(() => {
      const upsert = db.prepare(`
        INSERT INTO playlists (
          cloud_id, name, description, cover_path, is_smart, smart_rules,
          sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_id) DO UPDATE SET
          name = excluded.name, description = excluded.description, cover_path = excluded.cover_path,
          is_smart = excluded.is_smart, smart_rules = excluded.smart_rules,
          sort_order = excluded.sort_order, updated_at = excluded.updated_at
      `);
      for (const record of finalLivePlaylists) {
        const entry = record.entry;
        upsert.run(
          entry.cloud_id, entry.name, entry.description,
          downloadedCovers.get(entry.cloud_id) ?? null, entry.is_smart ? 1 : 0,
          entry.smart_rules, entry.sort_order, entry.created_at, entry.updated_at,
        );
        const playlist = db.prepare('SELECT id FROM playlists WHERE cloud_id = ?')
          .get(entry.cloud_id) as { id: number };
        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlist.id);
        let position = 0;
        for (const hash of entry.track_hashes) {
          const trackId = trackIdByHash.get(hash);
          if (trackId != null) {
            db.prepare(`
              INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)
            `).run(playlist.id, trackId, position++);
          }
        }
        result.importedPlaylists += 1;
      }

      const insertMirror = db.prepare(`
        INSERT OR REPLACE INTO cloud_sync_entities (
          scope_id, entity_type, entity_key, record_json, version_counter,
          version_device_id, is_deleted, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
      `);
      for (const record of changedTrackRecords) {
        if (trackIsProtected(record.content_hash_sha256)) continue;
        insertMirror.run(
          scopeId, 'track', record.content_hash_sha256, JSON.stringify(record),
          record.version.counter, record.version.device_id, record.deleted ? 1 : 0,
        );
      }
      for (const record of changedPlaylistRecords) {
        if (playlistIsProtected(record.cloud_id)) continue;
        insertMirror.run(
          scopeId, 'playlist', record.cloud_id, JSON.stringify(record),
          record.version.counter, record.version.device_id, record.deleted ? 1 : 0,
        );
      }
      const manifestTrackKeys = new Set(manifest.tracks.map((record) => record.content_hash_sha256));
      const manifestPlaylistKeys = new Set(manifest.playlists.map((record) => record.cloud_id));
      const deleteMirror = db.prepare(`
        DELETE FROM cloud_sync_entities
        WHERE scope_id = ? AND entity_type = ? AND entity_key = ?
      `);
      for (const row of mirrorRows) {
        if (row.entity_type === 'track' && trackIsProtected(row.entity_key)) continue;
        if (row.entity_type === 'playlist' && playlistIsProtected(row.entity_key)) continue;
        const stillPresent = row.entity_type === 'track'
          ? manifestTrackKeys.has(row.entity_key)
          : manifestPlaylistKeys.has(row.entity_key);
        if (!stillPresent) deleteMirror.run(scopeId, row.entity_type, row.entity_key);
      }
    })();
  });
}
