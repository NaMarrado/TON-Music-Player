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
  const total = trackIds.size + playlistIds.size;
  let current = 0;
  emitProgress(options.onProgress, { phase: 'hashing', total });
  for (const id of trackIds) {
    throwIfV2Cancelled(options);
    const serialized = await serializeTrackForV2(config, id);
    if (serialized) tracks.set(id, serialized);
    emitProgress(options.onProgress, { phase: 'hashing', current: ++current, total });
  }
  for (const id of playlistIds) {
    throwIfV2Cancelled(options);
    const serialized = await serializePlaylistForV2(config, id);
    if (serialized) playlists.set(id, serialized);
    emitProgress(options.onProgress, { phase: 'hashing', current: ++current, total });
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
