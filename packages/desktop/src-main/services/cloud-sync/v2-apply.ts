import fs from 'node:fs';
import type { CloudLibraryManifestV2, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { getLibraryDir } from '../library-paths';
import { DesktopR2Client } from './r2-client';
import { applyCloudPlaylistsV2 } from './v2-apply-playlists';
import { applyCloudTracksV2 } from './v2-apply-tracks';
import { throwIfV2Cancelled, type CloudMirrorRow, type V2SyncOptions } from './v2-types';

export async function applyCloudManifestV2(
  client: DesktopR2Client,
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  result: CloudSyncResult,
  options: V2SyncOptions,
  capturedGeneration: number,
): Promise<void> {
  throwIfV2Cancelled(options);
  await fs.promises.mkdir(getLibraryDir(), { recursive: true });
  const mirrorRows = getDb().prepare(`
    SELECT entity_type, entity_key, record_json
    FROM cloud_sync_entities WHERE scope_id = ?
  `).all(scopeId) as CloudMirrorRow[];
  const trackMirror = new Map(
    mirrorRows.filter((row) => row.entity_type === 'track')
      .map((row) => [row.entity_key, row.record_json]),
  );
  const playlistMirror = new Map(
    mirrorRows.filter((row) => row.entity_type === 'playlist')
      .map((row) => [row.entity_key, row.record_json]),
  );
  const tracks = await applyCloudTracksV2(
    client, scopeId, manifest, result, options, capturedGeneration, trackMirror,
  );
  throwIfV2Cancelled(options);
  await applyCloudPlaylistsV2({
    client,
    scopeId,
    manifest,
    result,
    options,
    capturedGeneration,
    mirrorRows,
    playlistMirror,
    changedTrackRecords: tracks.changedRecords,
    changedTrackHashes: tracks.changedHashes,
    trackIdByHash: tracks.trackIdByHash,
  });
}
