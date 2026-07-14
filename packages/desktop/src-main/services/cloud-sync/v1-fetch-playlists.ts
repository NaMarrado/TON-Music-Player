import path from 'node:path';
import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { ensureArtworkDir, getArtworkDir } from '../metadata-reader/artwork';
import { DesktopR2Client } from './r2-client';
import {
  pathExists,
  throwIfCancelled,
  type CancelSignal,
} from './sync-common';

async function fetchPlaylistCovers(
  client: DesktopR2Client,
  manifest: CloudLibraryManifestV1,
  shouldCancel?: CancelSignal,
): Promise<Map<string, string | null>> {
  const paths = new Map<string, string | null>();
  for (const playlist of manifest.playlists) {
    throwIfCancelled(shouldCancel);
    let coverPath: string | null = null;
    if (playlist.cover_object_key && playlist.cover_hash_sha256) {
      await ensureArtworkDir(getArtworkDir());
      const coverExt = path.extname(playlist.cover_object_key) || '.jpg';
      coverPath = path.join(getArtworkDir(), `${playlist.cover_hash_sha256}${coverExt}`);
      if (!(await pathExists(coverPath))) await client.downloadFile(playlist.cover_object_key, coverPath);
    }
    paths.set(playlist.cloud_id, coverPath);
  }
  return paths;
}

export async function fetchV1Playlists(
  client: DesktopR2Client,
  manifest: CloudLibraryManifestV1,
  trackIdByHash: Map<string, number>,
  result: CloudSyncResult,
  shouldCancel?: CancelSignal,
): Promise<void> {
  const db = getDb();
  const coverPaths = await fetchPlaylistCovers(client, manifest, shouldCancel);
  const upsertPlaylist = db.prepare(`
    INSERT INTO playlists (cloud_id, name, description, cover_path, is_smart, smart_rules, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cloud_id) DO UPDATE SET
      name = excluded.name, description = excluded.description, cover_path = excluded.cover_path,
      is_smart = excluded.is_smart, smart_rules = excluded.smart_rules,
      sort_order = excluded.sort_order, updated_at = excluded.updated_at
  `);
  const lookupPlaylist = db.prepare('SELECT id FROM playlists WHERE cloud_id = ?');
  const deletePlaylistTracks = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
  const insertPlaylistTrack = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
  );
  db.transaction(() => {
    for (const playlist of manifest.playlists) {
      throwIfCancelled(shouldCancel);
      upsertPlaylist.run(
        playlist.cloud_id, playlist.name, playlist.description,
        coverPaths.get(playlist.cloud_id) ?? null,
        playlist.is_smart ? 1 : 0, playlist.smart_rules, playlist.sort_order,
        playlist.created_at, playlist.updated_at,
      );
      const row = lookupPlaylist.get(playlist.cloud_id) as { id: number } | undefined;
      if (!row) continue;
      deletePlaylistTracks.run(row.id);
      let position = 0;
      for (const hash of playlist.track_hashes) {
        const trackId = trackIdByHash.get(hash);
        if (!trackId) continue;
        insertPlaylistTrack.run(row.id, trackId, position);
        position += 1;
      }
      result.importedPlaylists += 1;
    }
  })();
}
