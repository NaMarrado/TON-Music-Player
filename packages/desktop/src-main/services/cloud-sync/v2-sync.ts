import type { CloudLibraryManifestV2, CloudSyncResult } from '@ton/core';
import {
  buildCloudV2ManifestObjectKey,
  parseCloudLibraryManifestV2,
} from '@ton/core';
import {
  acknowledgeDesktopCloudOutbox,
  readDesktopCloudOutbox,
  readDesktopCloudSyncState,
  updateDesktopCloudSyncState,
} from './auto-sync-store';
import {
  activateDesktopCloudScope,
  getDesktopCloudDeviceId,
  setDesktopCloudLastRevision,
} from './config';
import { DesktopR2Client } from './r2-client';
import { EMPTY_RESULT, emitProgress, requireConfig } from './sync-common';
import { applyCloudManifestV2 } from './v2-apply';
import { bootstrapMissingV2Manifest } from './v2-bootstrap';
import { conditionalManifestEtag } from './v2-bootstrap-guard';
import { ensureV2ActivationMarker, queueReplacedRemoteBlobsForGc } from './v2-files';
import { serializePendingV2Entities } from './v2-local-entities';
import { createV2MutationBuilder } from './v2-mutations';
import { createV2ObjectUploader } from './v2-object-upload';
import { publishV2Manifest } from './v2-publish';
import { throwIfV2Cancelled, type V2SyncOptions } from './v2-types';

/**
 * Incremental V2 cycle. A clean conditional poll exits on 304 before touching
 * the library or hashing a file. Full scans happen only for bootstrap/reconcile.
 */
export async function syncCloudLibraryV2ForDesktop(
  options: V2SyncOptions = {},
): Promise<CloudSyncResult> {
  const config = requireConfig();
  const scopeId = activateDesktopCloudScope(config);
  const client = new DesktopR2Client(config);
  const deviceId = getDesktopCloudDeviceId();
  const state = readDesktopCloudSyncState(scopeId);
  const durableOutbox = readDesktopCloudOutbox(scopeId);
  const requestedMode = options.mode ?? 'sync';
  let mode = requestedMode === 'fetch' && durableOutbox.length > 0 ? 'sync' : requestedMode;
  let shouldUpload = mode !== 'fetch';
  const shouldApply = mode !== 'upload';
  let outbox = shouldUpload ? durableOutbox : [];
  let capturedGeneration = outbox.reduce((max, item) => Math.max(max, item.generation), 0);
  let fullReconcile = shouldUpload && Boolean(
    options.force || state.needs_full_reconcile
    || outbox.some((item) => item.operation === 'reconcile'),
  );
  const v2Key = buildCloudV2ManifestObjectKey(config.prefix);
  emitProgress(options.onProgress, { phase: 'reading-manifest', total: 1 });
  throwIfV2Cancelled(options);

  const initialRead = await client.getJsonConditional<CloudLibraryManifestV2>(v2Key, {
    ifNoneMatch: conditionalManifestEtag(
      Boolean(options.force), fullReconcile, outbox.length, state.etag,
    ),
    signal: options.signal,
  });
  throwIfV2Cancelled(options);
  if (initialRead.status === 'not-modified' && outbox.length === 0 && !fullReconcile) {
    if (!state.activation_marker_confirmed) {
      await ensureV2ActivationMarker(client, config, scopeId, options.signal);
    }
    throwIfV2Cancelled(options);
    updateDesktopCloudSyncState(scopeId, {
      last_success_at: Date.now(), last_error: null, next_retry_at: null,
    });
    emitProgress(options.onProgress, { phase: 'done', current: 1, total: 1 });
    return { ...EMPTY_RESULT, revision: state.revision };
  }

  let remote: CloudLibraryManifestV2 | null = initialRead.status === 'ok'
    ? parseCloudLibraryManifestV2(initialRead.value)
    : null;
  let remoteEtag = initialRead.status === 'ok' ? initialRead.etag : null;
  const createV2 = initialRead.status === 'missing';
  let authoritativeV2Head = initialRead.status === 'ok';
  let bootstrappingFromV1 = false;
  if (initialRead.status === 'ok' && !remote) throw new Error('cloud_sync_invalid_v2_manifest');
  if (createV2) {
    if (!shouldUpload) {
      mode = 'sync';
      shouldUpload = true;
      outbox = durableOutbox;
      capturedGeneration = outbox.reduce((max, item) => Math.max(max, item.generation), 0);
      fullReconcile = true;
    }
    const bootstrap = await bootstrapMissingV2Manifest({
      client, config, scopeId, state, deviceId, options,
    });
    remote = bootstrap.remote;
    bootstrappingFromV1 = bootstrap.bootstrappingFromV1;
  }
  if (!remote) throw new Error('cloud_sync_invalid_v2_manifest');

  const serialized = await serializePendingV2Entities(
    config, remote, outbox, fullReconcile, options,
  );
  const mutations = createV2MutationBuilder({
    state,
    deviceId,
    outbox,
    tracks: serialized.tracks,
    playlists: serialized.playlists,
    bootstrappingFromV1,
    repairReferencedBlobs: shouldUpload && Boolean(options.force),
  });
  let mutationManifest = mutations.build(remote);
  const hasMutations = mutationManifest.tracks.length > 0 || mutationManifest.playlists.length > 0;
  const result: CloudSyncResult = { ...EMPTY_RESULT };
  const uploadRequiredObjects = createV2ObjectUploader({
    client,
    options,
    result,
    tracks: serialized.tracks,
    requiredAudio: mutations.requiredAudio,
    requiredArtwork: mutations.requiredArtwork,
    repairObjectKeys: mutations.repairObjectKeys,
  });
  await uploadRequiredObjects();

  let published = remote;
  let publishedEtag = remoteEtag;
  let publicationBase = remote;
  if (shouldUpload && (hasMutations || createV2)) {
    const publication = await publishV2Manifest({
      client, config, scopeId, state, deviceId, v2Key, remote, remoteEtag,
      createV2, mutationManifest, buildMutations: mutations.build,
      uploadRequiredObjects, options,
    });
    published = publication.published;
    publishedEtag = publication.publishedEtag;
    publicationBase = publication.remote;
    authoritativeV2Head = true;
    mutationManifest = mutations.build(publicationBase);
  }
  if (authoritativeV2Head && !state.activation_marker_confirmed) {
    await ensureV2ActivationMarker(client, config, scopeId, options.signal);
  }

  throwIfV2Cancelled(options);
  if (shouldUpload) queueReplacedRemoteBlobsForGc(scopeId, publicationBase, published);
  if (shouldApply) {
    await applyCloudManifestV2(
      client, scopeId, published, result, options, capturedGeneration,
    );
  }
  throwIfV2Cancelled(options);
  if (shouldUpload) acknowledgeDesktopCloudOutbox(scopeId, capturedGeneration);
  throwIfV2Cancelled(options);
  updateDesktopCloudSyncState(scopeId, {
    revision: mode === 'upload' ? state.revision : published.revision,
    etag: mode === 'upload' ? null : publishedEtag,
    lamport_counter: published.max_counter,
    last_success_at: Date.now(),
    last_error: null,
    next_retry_at: null,
    needs_full_reconcile: shouldApply ? 0 : state.needs_full_reconcile,
    pending_remote_revision: mode === 'upload' ? published.revision : null,
    pending_downloads: shouldApply ? result.failed : state.pending_downloads,
  });
  setDesktopCloudLastRevision(published.revision);
  result.revision = published.revision;
  emitProgress(options.onProgress, {
    phase: 'done', current: 1, total: 1, uploaded: result.uploaded,
    downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
  });
  return result;
}
