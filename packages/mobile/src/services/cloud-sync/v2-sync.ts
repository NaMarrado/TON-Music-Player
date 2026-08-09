import {
  buildCloudV2ManifestObjectKey,
  type CloudSyncProgress,
  type CloudSyncResult,
} from '@ton/core';
import { scheduleMobileJob } from '../job-scheduler';
import { getMobileCloudDeviceId } from './config';
import {
  acknowledgeMobileCloudOutbox,
  ensureMobileCloudScope,
  getMobileCloudMissingMirroredEntityCount,
  getMobileCloudOutbox,
  getMobileCloudPersistedState,
  updateMobileCloudPersistedState,
} from './local-state';
import { MobileR2Client } from './r2-client';
import { applyMobileV2Publication } from './v2-apply-publication';
import {
  EMPTY_RESULT,
  emitProgress,
  throwIfAborted,
  type MobileCloudV2SyncOptions,
} from './v2-common';
import { queueBlobGcTransitions } from './v2-maintenance';
import { storeEntityMirror } from './v2-mirror';
import { prepareIncrementalManifest } from './v2-prepare-incremental';
import { publishMobileV2Head } from './v2-publish';
import { shouldDiscoverMissingLocalEntities } from './missing-local-policy';
import { prepareMobileManifestForLocalDevice } from './local-exclusions';
import { prepareMissingLocalUpload } from './v2-prepare-upload';

export type { MobileCloudSyncMode, MobileCloudV2SyncOptions } from './v2-common';

export async function runMobileCloudV2Sync(
  options: MobileCloudV2SyncOptions,
): Promise<CloudSyncResult> {
  return scheduleMobileJob({
    kind: 'cloud-sync',
    lane: 'network',
    priority: options.origin === 'manual' ? 'user-visible' : 'background',
    run: async () => {
      const { config, mode, signal } = options;
      const trackProgress = {
        downloading: { current: 0, total: 0 },
        uploading: { current: 0, total: 0 },
      };
      const onProgress = (progress: CloudSyncProgress) => {
        if (progress.phase === 'downloading' || progress.phase === 'uploading') {
          trackProgress[progress.phase] = {
            current: progress.current,
            total: progress.total,
          };
        }
        options.onProgress?.(progress);
      };
      const trackedOptions = { ...options, onProgress };
      const result: CloudSyncResult = { ...EMPTY_RESULT };
      const scopeId = await ensureMobileCloudScope(config);
      const state = await getMobileCloudPersistedState(scopeId);
      const durableOutbox = await getMobileCloudOutbox(scopeId);
      const outbox = mode === 'fetch' ? [] : durableOutbox;
      const maxGeneration = durableOutbox.reduce(
        (max, row) => Math.max(max, row.generation), 0,
      );
      const deviceId = await getMobileCloudDeviceId();
      const client = new MobileR2Client(config);
      // Full object verification is intentionally reserved for the explicit
      // "Upload missing local" action. A normal manual sync must stay incremental.
      const manualRecovery = shouldDiscoverMissingLocalEntities(options.origin, mode);
      if (mode === 'fetch'
          && !options.restoreLocallyDeleted
          && state.etag
          && state.pending_downloads === 0
          && state.pending_assets === 0
          && await getMobileCloudMissingMirroredEntityCount(scopeId) === 0) {
        emitProgress(onProgress, { phase: 'reading-manifest', current: 0, total: 1 });
        const unchanged = await client.getJsonConditional(
          buildCloudV2ManifestObjectKey(config.prefix), state.etag, signal,
        );
        if (unchanged.status === 'not-modified') {
          await updateMobileCloudPersistedState(scopeId, {
            last_success_at: Math.floor(Date.now() / 1000),
            last_error: null,
            next_retry_at: null,
          });
          emitProgress(onProgress, {
            phase: 'done', current: 1, total: 1,
          });
          return { ...EMPTY_RESULT, revision: state.revision };
        }
      }
      const needsLocal = mode !== 'fetch'
        && (manualRecovery || outbox.length > 0 || state.needs_full_reconcile === 1);
      const discoverMissingLocal = needsLocal
        && (state.needs_full_reconcile === 1 || manualRecovery);
      const prepared = needsLocal && !discoverMissingLocal
        ? await prepareIncrementalManifest(config, deviceId, outbox, signal)
        : null;
      const publication = await publishMobileV2Head({
        client, options: trackedOptions, scopeId, state, outbox, deviceId,
        prepared,
        prepareForRemote: discoverMissingLocal
          ? (remote) => prepareMissingLocalUpload(
            config, deviceId, remote, outbox, onProgress, signal,
          )
          : undefined,
        needsLocal, result,
      });
      await queueBlobGcTransitions(
        scopeId, publication.previousRemoteForGc, publication.published,
      );
      const localPublication = mode === 'upload'
        ? { manifest: publication.published, restored: 0 }
        : await prepareMobileManifestForLocalDevice(
          scopeId,
          publication.published,
          Boolean(options.restoreLocallyDeleted),
        );
      const pending = await applyMobileV2Publication({
        options: trackedOptions,
        scopeId,
        state,
        maxAcknowledgedGeneration: maxGeneration,
        published: localPublication.manifest,
        result,
      });
      result.restoredLocallyDeleted = localPublication.restored;
      throwIfAborted(signal);
      await storeEntityMirror(scopeId, publication.published, maxGeneration, signal);
      // Fetch is cloud-authoritative, but it must not discard pending local
      // upserts. Only a run that actually publishes them may acknowledge them.
      if (mode !== 'fetch' && maxGeneration > 0) {
        await acknowledgeMobileCloudOutbox(scopeId, maxGeneration);
      }
      throwIfAborted(signal);
      await updateMobileCloudPersistedState(scopeId, {
        revision: publication.published.revision,
        etag: publication.publishedEtag,
        lamport_counter: publication.published.max_counter,
        last_success_at: Math.floor(Date.now() / 1000),
        last_error: null,
        next_retry_at: null,
        needs_full_reconcile: discoverMissingLocal ? 0 : state.needs_full_reconcile,
        pending_downloads: mode === 'upload' ? state.pending_downloads : pending.pendingDownloads,
        pending_assets: mode === 'upload' ? state.pending_assets : pending.pendingAssets,
      });
      result.revision = publication.published.revision;
      const completedTracks = trackProgress.uploading.current + trackProgress.downloading.current;
      const totalTracks = trackProgress.uploading.total + trackProgress.downloading.total;
      emitProgress(onProgress, {
        phase: 'done',
        current: totalTracks > 0 ? completedTracks : 1,
        total: totalTracks > 0 ? totalTracks : 1,
        uploaded: result.uploaded,
        downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
      });
      return result;
    },
  });
}
