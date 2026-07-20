import type {
  CloudLibraryManifestV2,
} from '@ton/core';
import { runMobileCloudDbLane } from './db-lane';
import {
  selectMobileCloudApplyDeltaFromState,
} from './v2-apply-delta-policy';

type MirrorRow = {
  entity_type: 'track' | 'playlist';
  entity_key: string;
  record_json: string;
};

type LocalTrackRow = {
  content_hash_sha256: string;
  cover_art_path: string | null;
};

type LocalPlaylistRow = {
  cloud_id: string;
  cover_path: string | null;
};

/**
 * Select only remote records that can change local state. The manifest remains
 * the source of truth; normal sync never probes every R2 media object.
 */
export async function selectMobileCloudApplyDelta(
  scopeId: string,
  manifest: CloudLibraryManifestV2,
): Promise<CloudLibraryManifestV2> {
  const [mirrorRows, localTracks, localPlaylists, failedTracks] = await Promise.all([
    runMobileCloudDbLane((db) => db.getAllAsync<MirrorRow>(
      `SELECT entity_type, entity_key, record_json
       FROM cloud_sync_entities WHERE scope_id = ?`,
      [scopeId],
    )),
    runMobileCloudDbLane((db) => db.getAllAsync<LocalTrackRow>(
      `SELECT content_hash_sha256, cover_art_path FROM tracks
       WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''`,
    )),
    runMobileCloudDbLane((db) => db.getAllAsync<LocalPlaylistRow>(
      `SELECT cloud_id, cover_path FROM playlists
       WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
    )),
    runMobileCloudDbLane((db) => db.getAllAsync<{ content_hash_sha256: string }>(
      `SELECT content_hash_sha256 FROM cloud_sync_download_failures
       WHERE scope_id = ?`,
      [scopeId],
    )),
  ]);

  const mirror = new Map(
    mirrorRows.map((row) => [
      `${row.entity_type}:${row.entity_type === 'track'
        ? row.entity_key.toLowerCase()
        : row.entity_key}`,
      row.record_json,
    ]),
  );
  const localTrackByHash = new Map(
    localTracks.map((row) => [row.content_hash_sha256.toLowerCase(), row]),
  );
  const localPlaylistByCloudId = new Map(
    localPlaylists.map((row) => [row.cloud_id, row]),
  );
  const failedHashes = new Set(
    failedTracks.map((row) => row.content_hash_sha256.toLowerCase()),
  );

  return selectMobileCloudApplyDeltaFromState(manifest, {
    mirror,
    localTrackArtworkByHash: new Map(
      [...localTrackByHash].map(([hash, row]) => [hash, row.cover_art_path]),
    ),
    localPlaylistCoverByCloudId: new Map(
      [...localPlaylistByCloudId].map(([cloudId, row]) => [cloudId, row.cover_path]),
    ),
    failedTrackHashes: failedHashes,
  });
}
