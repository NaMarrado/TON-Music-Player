import type { CloudLibraryManifestV2, CloudSyncResult } from '@ton/core';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { loadPlaylists, reloadLoadedPlaylistDetails } from '../../stores/playlist-store';
import { fetchCloudLibrary } from './v1-fetch';
import {
  getMobileCloudProtectedEntities,
  type MobileCloudPersistedState,
} from './local-state';
import { applyManifestWithoutAudio } from './v2-apply-metadata';
import { countMobileCloudDownloadFailures } from './download-failures';
import {
  selectMobileCloudApplyDelta,
} from './v2-apply-delta';
import { hasMobileCloudApplyDelta } from './v2-apply-delta-policy';
import {
  projectManifestV2ToV1,
  throwIfAborted,
  type MobileCloudV2SyncOptions,
} from './v2-common';
import { applyTombstones, omitProtectedManifestEntities } from './v2-tombstones';

export async function applyMobileV2Publication(input: {
  options: MobileCloudV2SyncOptions;
  scopeId: string;
  state: MobileCloudPersistedState;
  maxAcknowledgedGeneration: number;
  published: CloudLibraryManifestV2;
  result: CloudSyncResult;
}): Promise<{ pendingDownloads: number; pendingAssets: number }> {
  const { options, scopeId, maxAcknowledgedGeneration, published, result } = input;
  const { mode, signal } = options;
  let pendingDownloads = 0;
  let pendingAssets = 0;
  if (mode === 'upload') return { pendingDownloads, pendingAssets };

  throwIfAborted(signal);
  const protectedEntities = await getMobileCloudProtectedEntities(
    scopeId, maxAcknowledgedGeneration,
  );
  const applicableManifest = omitProtectedManifestEntities(published, protectedEntities);
  const applyDelta = await selectMobileCloudApplyDelta(scopeId, applicableManifest);
  const applyProtection = { scopeId, afterGeneration: maxAcknowledgedGeneration };
  if (options.allowAudioDownloads) {
    if (hasMobileCloudApplyDelta(applyDelta)) {
      await applyTombstones(applyDelta, applyProtection, signal);
      const fetched = await fetchCloudLibrary(
        options.onProgress,
        () => Boolean(signal?.aborted),
        projectManifestV2ToV1(applyDelta),
        signal,
        applyProtection,
        options.origin === 'manual' ? 'user-visible' : 'background',
        true,
        {
          scopeId,
          manifestRevision: applicableManifest.revision,
          retryFailed: options.origin === 'manual',
        },
      );
      result.downloaded += fetched.downloaded;
      result.skipped += fetched.skipped;
      result.failed += fetched.failed;
      result.importedTracks += fetched.importedTracks;
      result.importedPlaylists += fetched.importedPlaylists;
      await Promise.all([
        reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
        loadPlaylists(),
      ]);
      await reloadLoadedPlaylistDetails();
    }
    pendingDownloads = await countMobileCloudDownloadFailures(
      scopeId,
      applicableManifest.revision,
    );
  } else {
    // Metered/offline metadata sync must stay incremental too. Applying the
    // full publication here used to rewrite every track and playlist after a
    // single manifest GET even when only one remote record had changed.
    if (hasMobileCloudApplyDelta(applyDelta)) {
      const pending = await applyManifestWithoutAudio(
        applyDelta, scopeId, maxAcknowledgedGeneration, signal,
      );
      pendingDownloads = pending.pendingDownloads;
      pendingAssets = pending.pendingAssets;
    }
  }
  throwIfAborted(signal);
  return { pendingDownloads, pendingAssets };
}
