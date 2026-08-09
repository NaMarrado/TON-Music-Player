import type { CloudLibraryManifestV2, CloudStorageConfig, Track } from '@ton/core';
import { getTrackById } from '../db-queries';
import { ensurePlaylistCloudId, ensureTrackContentHash } from './v1-common';
import { runMobileCloudDbLane } from './db-lane';
import type { MobileCloudOutboxRow } from './local-state';
import { emitProgress, throwIfAborted, type MobileCloudV2SyncOptions } from './v2-common';
import { prepareIncrementalManifest } from './v2-prepare-incremental';
import { selectMissingLocalEntityIds } from './v2-prepare-upload-policy';

type LocalTrackIdentity = Pick<Track, 'id' | 'content_hash_sha256'>;
type LocalPlaylistIdentity = { id: number; cloud_id: string | null };

function syntheticUpsert(
  entityType: MobileCloudOutboxRow['entity_type'],
  localId: number,
  generation: number,
): MobileCloudOutboxRow {
  return {
    scope_id: '',
    entity_type: entityType,
    entity_key: String(localId),
    local_id: localId,
    operation: 'upsert',
    payload_json: null,
    generation,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Builds the explicit "Upload missing local" delta from the remote manifest.
 * Existing hashes and cloud IDs are compared in SQLite/JS only; media files are
 * opened solely when a local track has never been hashed or must be uploaded.
 */
export async function prepareMissingLocalUpload(
  config: CloudStorageConfig,
  deviceId: string,
  remote: CloudLibraryManifestV2,
  durableOutbox: readonly MobileCloudOutboxRow[],
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<{
  outbox: MobileCloudOutboxRow[];
  prepared: Awaited<ReturnType<typeof prepareIncrementalManifest>>;
}> {
  const snapshot = await runMobileCloudDbLane(async (db) => ({
    tracks: await db.getAllAsync<LocalTrackIdentity>(
      'SELECT id, content_hash_sha256 FROM tracks ORDER BY id ASC',
    ),
    playlists: await db.getAllAsync<LocalPlaylistIdentity>(
      'SELECT id, cloud_id FROM playlists ORDER BY id ASC',
    ),
  }));
  const remoteTrackHashes = new Set(
    remote.tracks.map((record) => record.content_hash_sha256.toLowerCase()),
  );
  const remotePlaylistIds = new Set(remote.playlists.map((record) => record.cloud_id));
  const missing = selectMissingLocalEntityIds(snapshot, remoteTrackHashes, remotePlaylistIds);
  const rows = new Map(
    durableOutbox.map((row) => [`${row.entity_type}:${row.local_id ?? row.entity_key}`, row]),
  );
  const generation = durableOutbox.reduce((max, row) => Math.max(max, row.generation), 0);

  if (missing.unhashedTrackIds.length > 0) {
    emitProgress(onProgress, {
      phase: 'hashing', current: 0, total: missing.unhashedTrackIds.length,
    });
  }
  for (const trackId of missing.trackIds) {
    const row = syntheticUpsert('track', trackId, generation);
    rows.set(`track:${trackId}`, row);
  }
  let hashed = 0;
  for (const trackId of missing.unhashedTrackIds) {
    throwIfAborted(signal);
    const track = await getTrackById(trackId);
    const contentHash = track ? await ensureTrackContentHash(track) : null;
    emitProgress(onProgress, {
      phase: 'hashing', current: ++hashed, total: missing.unhashedTrackIds.length,
      failed: contentHash ? 0 : 1,
    });
    if (!contentHash || remoteTrackHashes.has(contentHash.toLowerCase())) continue;
    const row = syntheticUpsert('track', trackId, generation);
    rows.set(`track:${trackId}`, row);
  }

  const playlistById = new Map(snapshot.playlists.map((playlist) => [playlist.id, playlist]));
  for (const playlistId of missing.playlistIds) {
    throwIfAborted(signal);
    const identity = playlistById.get(playlistId);
    if (!identity) continue;
    const cloudId = await ensurePlaylistCloudId(playlistId, identity.cloud_id);
    if (remotePlaylistIds.has(cloudId)) continue;
    const row = syntheticUpsert('playlist', playlistId, generation);
    rows.set(`playlist:${playlistId}`, row);
  }

  const outbox = [...rows.values()];
  return {
    outbox,
    prepared: await prepareIncrementalManifest(config, deviceId, outbox, signal),
  };
}
