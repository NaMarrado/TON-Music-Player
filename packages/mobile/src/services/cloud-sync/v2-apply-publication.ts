import type { CloudLibraryManifestV2, CloudSyncResult } from '@ton/core';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { loadPlaylists, reloadLoadedPlaylistDetails } from '../../stores/playlist-store';
import { fetchCloudLibrary } from './v1-fetch';
import {
  getMobileCloudProtectedEntities,
  type MobileCloudPersistedState,
} from './local-state';
import { applyManifestWithoutAudio } from './v2-apply-metadata';
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
  const applyProtection = { scopeId, afterGeneration: maxAcknowledgedGeneration };
  if (options.allowAudioDownloads) {
    await applyTombstones(applicableManifest, applyProtection, signal);
    const fetched = await fetchCloudLibrary(
      options.onProgress,
      () => Boolean(signal?.aborted),
      projectManifestV2ToV1(applicableManifest),
      signal,
      applyProtection,
      options.origin === 'manual' ? 'user-visible' : 'background',
      true,
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
  } else {
    const pending = await applyManifestWithoutAudio(
      applicableManifest, scopeId, maxAcknowledgedGeneration, signal,
    );
    pendingDownloads = pending.pendingDownloads;
    pendingAssets = pending.pendingAssets;
  }
  throwIfAborted(signal);
  return { pendingDownloads, pendingAssets };
}
