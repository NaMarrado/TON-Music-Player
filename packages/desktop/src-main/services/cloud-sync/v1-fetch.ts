import type { CloudSyncResult } from '@ton/core';
import { setDesktopCloudLastRevision } from './config';
import { DesktopR2Client } from './r2-client';
import {
  EMPTY_RESULT,
  emitProgress,
  requireConfig,
  type CancelSignal,
  type ProgressCallback,
} from './sync-common';
import { fetchV1Playlists } from './v1-fetch-playlists';
import { fetchV1Tracks } from './v1-fetch-tracks';
import { readRemoteManifest } from './v1-remote-manifest';

export async function fetchCloudLibraryToDesktop(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  const config = requireConfig();
  const client = new DesktopR2Client(config);
  const manifest = await readRemoteManifest(client, config);
  if (!manifest) return { ...EMPTY_RESULT };

  const result: CloudSyncResult = { ...EMPTY_RESULT, revision: manifest.revision };
  const trackIdByHash = await fetchV1Tracks(client, manifest, result, onProgress, shouldCancel);
  emitProgress(onProgress, {
    phase: 'importing', total: manifest.playlists.length,
    downloaded: result.downloaded, skipped: result.skipped,
  });
  await fetchV1Playlists(client, manifest, trackIdByHash, result, shouldCancel);
  setDesktopCloudLastRevision(manifest.revision);
  emitProgress(onProgress, {
    phase: 'done', current: 1, total: 1,
    downloaded: result.downloaded, skipped: result.skipped,
  });
  return result;
}
