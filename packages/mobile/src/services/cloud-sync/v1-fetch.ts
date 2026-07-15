import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { ensureArtworkDir } from '../cover-art';
import { ensureMusicDir } from '../downloader/filesystem';
import { scheduleMobileJob } from '../job-scheduler';
import { setMobileCloudLastRevision } from './config';
import { MobileR2Client } from './r2-client';
import {
  EMPTY_RESULT,
  emitProgress,
  requireConfig,
  throwIfCancelled,
  type CancelSignal,
  type CloudFetchApplyProtection,
  type ProgressCallback,
} from './v1-common';
import { fetchV1Playlists } from './v1-fetch-playlists';
import { fetchV1Tracks } from './v1-fetch-tracks';
import { readRemoteManifest } from './v1-remote-manifest';

export async function fetchCloudLibrary(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
  manifestOverride?: CloudLibraryManifestV1,
  abortSignal?: AbortSignal,
  applyProtection?: CloudFetchApplyProtection,
  priority: 'user-visible' | 'background' = 'user-visible',
  alreadyScheduled = false,
): Promise<CloudSyncResult> {
  const run = async (): Promise<CloudSyncResult> => {
    throwIfCancelled(shouldCancel);
    const config = await requireConfig();
    const client = new MobileR2Client(config);
    const manifest = manifestOverride ?? await readRemoteManifest(client, config);
    if (!manifest) return { ...EMPTY_RESULT };
    const result: CloudSyncResult = { ...EMPTY_RESULT, revision: manifest.revision };
    await ensureMusicDir();
    await ensureArtworkDir();
    const trackIdByHash = await fetchV1Tracks({
      client, manifest, result, onProgress, shouldCancel, abortSignal, applyProtection,
    });
    emitProgress(onProgress, {
      phase: 'importing', total: manifest.playlists.length,
      downloaded: result.downloaded, skipped: result.skipped,
    });
    await fetchV1Playlists({
      client, manifest, trackIdByHash, result,
      shouldCancel, abortSignal, applyProtection,
    });
    throwIfCancelled(shouldCancel);
    await setMobileCloudLastRevision(manifest.revision);
    emitProgress(onProgress, {
      phase: 'done', current: 1, total: 1,
      downloaded: result.downloaded, skipped: result.skipped,
    });
    return result;
  };
  if (alreadyScheduled) return run();
  return scheduleMobileJob({ kind: 'cloud-sync', lane: 'network', priority, run });
}
