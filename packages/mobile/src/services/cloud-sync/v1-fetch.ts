import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { ensureArtworkDir } from '../cover-art';
import { ensureMusicDir } from '../downloader/filesystem';
import { scheduleMobileJob } from '../job-scheduler';
import { upsertTrackById } from '../../stores/library-store';
import {
  loadPlaylists,
  mergeCompletedTrackIntoPlaylists,
  reloadLoadedPlaylistDetails,
} from '../../stores/playlist-store';
import { setMobileCloudLastRevision } from './config';
import type { MobileCloudDownloadFailureContext } from './download-failures';
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
import {
  addAvailableTrackToV1Playlists,
  downloadV1PlaylistCovers,
  prepareV1PlaylistShells,
} from './v1-fetch-playlists';
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
  failureContext?: MobileCloudDownloadFailureContext,
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
    const preparedPlaylists = await prepareV1PlaylistShells({
      manifest, result, onProgress, shouldCancel, abortSignal, applyProtection,
    });
    await loadPlaylists();
    await reloadLoadedPlaylistDetails();
    await downloadV1PlaylistCovers({
      client, manifest, prepared: preparedPlaylists, result, shouldCancel, abortSignal,
    });
    await fetchV1Tracks({
      client, manifest, result, onProgress, shouldCancel, abortSignal, applyProtection,
      failureContext,
      onTrackImported: async (contentHash, trackId) => {
        const playlistIds = await addAvailableTrackToV1Playlists({
          prepared: preparedPlaylists,
          contentHash,
          trackId,
        });
        await Promise.all([
          upsertTrackById(trackId),
          mergeCompletedTrackIntoPlaylists(trackId, playlistIds),
        ]);
      },
    });
    throwIfCancelled(shouldCancel);
    await setMobileCloudLastRevision(manifest.revision);
    emitProgress(onProgress, {
      phase: 'done', current: 1, total: 1,
      downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
    });
    return result;
  };
  if (alreadyScheduled) return run();
  return scheduleMobileJob({ kind: 'cloud-sync', lane: 'network', priority, run });
}
