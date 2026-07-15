import type { CloudLibraryManifestV2, CloudSyncResult } from '@ton/core';
import {
  buildCloudRevision,
  buildCloudV2ActivationObjectKey,
  buildCloudV2CommitObjectKey,
  buildCloudV2ManifestObjectKey,
  convertCloudLibraryManifestV1ToV2,
  createEmptyCloudLibraryManifestV2,
  mergeCloudLibraryManifestsV2,
  parseCloudLibraryManifestV2,
} from '@ton/core';
import { getDb } from '../database';
import {
  updateMobileCloudPersistedState,
  type MobileCloudOutboxRow,
  type MobileCloudPersistedState,
} from './local-state';
import { MobileR2Client, MobileR2PreconditionFailedError } from './r2-client';
import {
  emitProgress,
  ensureV2ActivationMarker,
  readBootstrapManifestV1,
  throwIfAborted,
  type MobileCloudV2SyncOptions,
  type PreparedLocalManifest,
} from './v2-common';
import { buildLocalMutationManifest } from './v2-mutations';
import { repairMissingPublishedObjects, uploadPreparedObjects } from './v2-upload';

export async function publishMobileV2Head(input: {
  client: MobileR2Client;
  options: MobileCloudV2SyncOptions;
  scopeId: string;
  state: MobileCloudPersistedState;
  outbox: MobileCloudOutboxRow[];
  deviceId: string;
  prepared: PreparedLocalManifest | null;
  needsLocal: boolean;
  manualRecovery: boolean;
  result: CloudSyncResult;
}): Promise<{
  published: CloudLibraryManifestV2;
  publishedEtag: string | null;
  previousRemoteForGc: CloudLibraryManifestV2 | null;
}> {
  const {
    client, options, scopeId, state, outbox, deviceId,
    prepared, needsLocal, manualRecovery, result,
  } = input;
  const { config, signal } = options;
  let published: CloudLibraryManifestV2 | null = null;
  let publishedEtag: string | null = null;
  let previousRemoteForGc: CloudLibraryManifestV2 | null = null;
  const attemptedUploadKeys = new Set<string>();
  let bootstrapLiveMerge = false;
  let activationEnsured = state.activation_marker_confirmed === 1;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    throwIfAborted(signal);
    emitProgress(options.onProgress, { phase: 'reading-manifest', current: attempt, total: 5 });
    const remoteRead = await client.getJsonConditional<CloudLibraryManifestV2>(
      buildCloudV2ManifestObjectKey(config.prefix), undefined, signal,
    );
    let remote = remoteRead.status === 'ok' ? parseCloudLibraryManifestV2(remoteRead.value) : null;
    let remoteSource: 'v2' | 'v1' | 'empty' = remote ? 'v2' : 'empty';
    const currentEtag = remoteRead.status === 'ok' ? remoteRead.etag : null;
    if (remoteRead.status === 'ok' && !remote) throw new Error('cloud_sync_invalid_v2_manifest');
    if (remote && !activationEnsured) {
      await ensureV2ActivationMarker(client, config, deviceId, signal);
      await updateMobileCloudPersistedState(scopeId, { activation_marker_confirmed: 1 });
      activationEnsured = true;
    }
    if (!remote) {
      const [mirror, activation] = await Promise.all([
        getDb().getFirstAsync<{ present: number }>(
          `SELECT EXISTS(SELECT 1 FROM cloud_sync_entities WHERE scope_id = ? LIMIT 1) AS present`,
          [scopeId],
        ),
        client.getJsonConditional<Record<string, unknown>>(
          buildCloudV2ActivationObjectKey(config.prefix), undefined, signal,
        ),
      ]);
      if (state.etag || state.revision || mirror?.present || activation.status === 'ok') {
        throw new Error('cloud_sync_v2_manifest_missing');
      }
      const legacy = await readBootstrapManifestV1(client, config, signal);
      remoteSource = legacy ? 'v1' : 'empty';
      remote = legacy
        ? convertCloudLibraryManifestV1ToV2(legacy)
        : createEmptyCloudLibraryManifestV2(deviceId);
    }
    if (remoteRead.status === 'missing' && remoteSource !== 'v2') bootstrapLiveMerge = true;
    previousRemoteForGc = remote;
    const versionedLocal = buildLocalMutationManifest(
      remote,
      prepared,
      outbox,
      deviceId,
      Math.max(state.lamport_counter, remote.max_counter),
      bootstrapLiveMerge && prepared?.incremental === false,
    );
    await uploadPreparedObjects(
      client, prepared, versionedLocal, attemptedUploadKeys,
      result, options.onProgress, signal,
    );
    if (manualRecovery) {
      await repairMissingPublishedObjects(
        client, prepared, remote, attemptedUploadKeys,
        result, options.onProgress, signal,
      );
    }
    if (remoteRead.status !== 'missing' && !needsLocal) {
      published = remote;
      publishedEtag = currentEtag;
      break;
    }
    const now = Date.now();
    const revision = buildCloudRevision(deviceId, now);
    const merged = mergeCloudLibraryManifestsV2(remote, versionedLocal, {
      writerDeviceId: deviceId, revision, updatedAt: now,
    });
    emitProgress(options.onProgress, { phase: 'writing-manifest', current: attempt, total: 5 });
    if (remoteRead.status !== 'missing' && !currentEtag) throw new Error('cloud_sync_missing_etag');
    try {
      const write = await client.putJsonConditional(
        buildCloudV2ManifestObjectKey(config.prefix),
        merged,
        remoteRead.status === 'missing'
          ? { ifNoneMatch: '*', signal }
          : { ifMatch: currentEtag as string, signal },
      );
      published = merged;
      publishedEtag = write.etag;
      if (!activationEnsured) {
        await ensureV2ActivationMarker(client, config, deviceId, signal);
        await updateMobileCloudPersistedState(scopeId, { activation_marker_confirmed: 1 });
        activationEnsured = true;
      }
      await client.putJson(buildCloudV2CommitObjectKey(config.prefix, revision), merged, signal);
      if (!publishedEtag) {
        const verify = await client.getJsonConditional<CloudLibraryManifestV2>(
          buildCloudV2ManifestObjectKey(config.prefix), undefined, signal,
        );
        if (verify.status !== 'ok' || !verify.etag) throw new Error('cloud_sync_missing_etag');
        published = parseCloudLibraryManifestV2(verify.value);
        if (!published) throw new Error('cloud_sync_invalid_v2_manifest');
        publishedEtag = verify.etag;
      }
      break;
    } catch (error) {
      if (!(error instanceof MobileR2PreconditionFailedError) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 220));
    }
  }
  if (!published) throw new Error('cloud_sync_conflict_retry_exhausted');
  if (!activationEnsured) {
    await ensureV2ActivationMarker(client, config, deviceId, signal);
    await updateMobileCloudPersistedState(scopeId, { activation_marker_confirmed: 1 });
  }
  return { published, publishedEtag, previousRemoteForGc };
}
