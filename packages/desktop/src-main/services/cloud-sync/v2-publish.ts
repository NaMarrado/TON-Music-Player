import type { CloudLibraryManifestV2, CloudStorageConfig } from '@ton/core';
import {
  buildCloudRevision,
  buildCloudV2CommitObjectKey,
  mergeCloudLibraryManifestsV2,
  parseCloudLibraryManifestV2,
} from '@ton/core';
import type { DesktopCloudSyncStateRow } from './auto-sync-store';
import { DesktopR2Client } from './r2-client';
import { emitProgress } from './sync-common';
import { cleanupOldV2CommitsIfDue, ensureV2ActivationMarker } from './v2-files';
import { throwIfV2Cancelled, type V2SyncOptions } from './v2-types';

function waitForConflictRetry(options: V2SyncOptions): Promise<void> {
  throwIfV2Cancelled(options);
  const delayMs = 80 + Math.floor(Math.random() * 221);
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(new Error('cloud_sync_cancelled'));
    };
    const timer = setTimeout(() => {
      options.signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    options.signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function publishV2Manifest(input: {
  client: DesktopR2Client;
  config: CloudStorageConfig;
  scopeId: string;
  state: DesktopCloudSyncStateRow;
  deviceId: string;
  v2Key: string;
  remote: CloudLibraryManifestV2;
  remoteEtag: string | null;
  createV2: boolean;
  mutationManifest: CloudLibraryManifestV2;
  buildMutations: (base: CloudLibraryManifestV2) => CloudLibraryManifestV2;
  uploadRequiredObjects: () => Promise<void>;
  options: V2SyncOptions;
}): Promise<{
  published: CloudLibraryManifestV2;
  publishedEtag: string | null;
  remote: CloudLibraryManifestV2;
}> {
  const {
    client, config, scopeId, state, deviceId, v2Key,
    buildMutations, uploadRequiredObjects, options,
  } = input;
  let { remote, remoteEtag, createV2, mutationManifest } = input;
  let published = remote;
  let publishedEtag = remoteEtag;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    throwIfV2Cancelled(options);
    await uploadRequiredObjects();
    const revision = buildCloudRevision(deviceId);
    published = mergeCloudLibraryManifestsV2(remote, mutationManifest, {
      writerDeviceId: deviceId, revision, updatedAt: Date.now(),
    });
    emitProgress(options.onProgress, { phase: 'writing-manifest', total: 1 });
    const write = await client.putJsonConditional(v2Key, published, createV2
      ? { ifNoneMatch: '*', signal: options.signal }
      : { ifMatch: remoteEtag, signal: options.signal });
    if (write.status === 'ok') {
      if (!state.activation_marker_confirmed) {
        await ensureV2ActivationMarker(client, config, scopeId, options.signal);
        state.activation_marker_confirmed = 1;
      }
      await client.putJson(
        buildCloudV2CommitObjectKey(config.prefix, revision), published, options.signal,
      );
      publishedEtag = write.etag;
      if (!publishedEtag) {
        const verified = await client.getJsonConditional<CloudLibraryManifestV2>(v2Key, {
          signal: options.signal,
        });
        const verifiedManifest = verified.status === 'ok'
          ? parseCloudLibraryManifestV2(verified.value)
          : null;
        if (!verifiedManifest || !verified.etag) throw new Error('cloud_sync_missing_etag');
        published = verifiedManifest;
        publishedEtag = verified.etag;
      }
      await cleanupOldV2CommitsIfDue(client, config, scopeId, options.signal).catch((error) => {
        throwIfV2Cancelled(options);
        console.warn('Cloud commit cleanup failed:', error);
      });
      return { published, publishedEtag, remote };
    }
    if (attempt === 4) throw new Error('cloud_sync_precondition_failed');
    await waitForConflictRetry(options);
    const refreshed = await client.getJsonConditional<CloudLibraryManifestV2>(v2Key, {
      signal: options.signal,
    });
    const parsed = refreshed.status === 'ok' ? parseCloudLibraryManifestV2(refreshed.value) : null;
    if (!parsed) throw new Error('cloud_sync_invalid_v2_manifest');
    remote = parsed;
    remoteEtag = refreshed.etag;
    createV2 = false;
    mutationManifest = buildMutations(remote);
  }
  throw new Error('cloud_sync_precondition_failed');
}
