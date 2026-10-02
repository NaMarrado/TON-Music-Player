import type { CloudLibraryManifestV2, CloudStorageConfig } from '@ton/core';
import { getDb } from '../database';
import type { DesktopCloudOutboxEntry } from './auto-sync-store';
import { emitProgress } from './sync-common';
import { serializePlaylistForV2, serializeTrackForV2 } from './v2-serialize';
import {
  throwIfV2Cancelled,
  type SerializedPlaylist,
  type SerializedTrack,
  type V2SyncOptions,
} from './v2-types';

export async function serializePendingV2Entities(
  config: CloudStorageConfig,
  remote: CloudLibraryManifestV2,
  outbox: DesktopCloudOutboxEntry[],
  fullReconcile: boolean,
  options: V2SyncOptions,
): Promise<{
  tracks: Map<number, SerializedTrack>;
  playlists: Map<number, SerializedPlaylist>;
}> {
  const db = getDb();
  const trackIds = new Set<number>();
  const pendingTrackIds = new Set(
    outbox.filter((item) => item.entity_type === 'track'
      && item.operation === 'upsert' && item.local_id != null)
      .map((item) => item.local_id as number),
  );
  const playlistIds = new Set<number>();
  if (fullReconcile) {
    (db.prepare('SELECT id FROM tracks ORDER BY id').all() as Array<{ id: number }>)
      .forEach((row) => trackIds.add(row.id));
    (db.prepare('SELECT id FROM playlists ORDER BY id').all() as Array<{ id: number }>)
      .forEach((row) => playlistIds.add(row.id));
  }
  for (const item of outbox) {
    if (item.operation !== 'upsert' || item.local_id == null) continue;
    if (item.entity_type === 'track') trackIds.add(item.local_id);
    if (item.entity_type === 'playlist') playlistIds.add(item.local_id);
  }

  const tracks = new Map<number, SerializedTrack>();
  const playlists = new Map<number, SerializedPlaylist>();
  const missingTrackHashIds = new Set(
    trackIds.size === 0
      ? []
      : (db.prepare(`
          SELECT id FROM tracks
          WHERE id IN (${[...trackIds].map(() => '?').join(', ')})
            AND (content_hash_sha256 IS NULL OR content_hash_sha256 = '')
        `).all(...trackIds) as Array<{ id: number }>).map((row) => row.id),
  );
  const total = missingTrackHashIds.size;
  let current = 0;
  if (total > 0) emitProgress(options.onProgress, { phase: 'hashing', total });
  for (const id of trackIds) {
    throwIfV2Cancelled(options);
    const serialized = await serializeTrackForV2(config, id);
    if (!serialized && pendingTrackIds.has(id)
        && db.prepare('SELECT id FROM tracks WHERE id = ?').get(id)) {
      // Never acknowledge an existing local entity that could not be
      // serialized. Its durable mutation must survive until the file returns.
      throw new Error('cloud_sync_local_file_missing');
    }
    if (serialized) tracks.set(id, serialized);
    if (missingTrackHashIds.has(id)) {
      emitProgress(options.onProgress, { phase: 'hashing', current: ++current, total });
    }
  }
  for (const id of playlistIds) {
    throwIfV2Cancelled(options);
    const serialized = await serializePlaylistForV2(config, id);
    if (serialized) playlists.set(id, serialized);
  }

  const remoteHashes = new Set(remote.tracks.map((record) => record.content_hash_sha256));
  const localHashes = new Set([...tracks.values()].map((track) => track.entry.content_hash_sha256));
  for (const playlist of playlists.values()) {
    for (const hash of playlist.entry.track_hashes) {
      if (remoteHashes.has(hash) || localHashes.has(hash)) continue;
      const row = db.prepare('SELECT id FROM tracks WHERE content_hash_sha256 = ? ORDER BY id LIMIT 1')
        .get(hash) as { id: number } | undefined;
      if (!row) continue;
      const serialized = await serializeTrackForV2(config, row.id);
      if (!serialized) continue;
      tracks.set(row.id, serialized);
      localHashes.add(hash);
    }
  }
  return { tracks, playlists };
}
