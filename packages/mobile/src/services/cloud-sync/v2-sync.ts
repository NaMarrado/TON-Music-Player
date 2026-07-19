import type { CloudSyncResult } from '@ton/core';
import { scheduleMobileJob } from '../job-scheduler';
import { getMobileCloudDeviceId } from './config';
import {
  acknowledgeMobileCloudOutbox,
  ensureMobileCloudScope,
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
import { prepareLocalManifest } from './v2-prepare-full';
import { prepareIncrementalManifest } from './v2-prepare-incremental';
import { publishMobileV2Head } from './v2-publish';
import { shouldRunManualCloudRepair } from './manual-repair-policy';

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
      const manualRecovery = shouldRunManualCloudRepair(options.origin, mode);
      const needsLocal = mode !== 'fetch'
        && (manualRecovery || outbox.length > 0 || state.needs_full_reconcile === 1);
      const prepared = needsLocal
        ? state.needs_full_reconcile === 1 || manualRecovery
          ? await prepareLocalManifest(config, deviceId, options.onProgress, signal)
          : await prepareIncrementalManifest(config, deviceId, outbox, signal)
        : null;
      const publication = await publishMobileV2Head({
        client, options, scopeId, state, outbox, deviceId,
        prepared, needsLocal, result,
      });
      await queueBlobGcTransitions(
        scopeId, publication.previousRemoteForGc, publication.published,
      );
      const pending = await applyMobileV2Publication({
        options,
        scopeId,
        state,
        maxAcknowledgedGeneration: maxGeneration,
        published: publication.published,
        result,
      });
      throwIfAborted(signal);
      if (mode !== 'upload') {
        await storeEntityMirror(scopeId, publication.published, maxGeneration, signal);
      }
      // Fetch is cloud-authoritative, but it must not discard pending local
      // upserts. Only a run that actually publishes them may acknowledge them.
      if (mode !== 'fetch' && maxGeneration > 0) {
        await acknowledgeMobileCloudOutbox(scopeId, maxGeneration);
      }
      throwIfAborted(signal);
      await updateMobileCloudPersistedState(scopeId, {
        revision: publication.published.revision,
        etag: mode === 'upload' ? null : publication.publishedEtag,
        lamport_counter: publication.published.max_counter,
        last_success_at: Math.floor(Date.now() / 1000),
        last_error: null,
        next_retry_at: null,
        needs_full_reconcile: mode === 'upload'
          || (mode === 'fetch' && state.needs_full_reconcile === 1) ? 1 : 0,
        pending_downloads: mode === 'upload' ? state.pending_downloads : pending.pendingDownloads,
        pending_assets: mode === 'upload' ? state.pending_assets : pending.pendingAssets,
      });
      result.revision = publication.published.revision;
      emitProgress(options.onProgress, {
        phase: 'done', current: 1, total: 1, uploaded: result.uploaded,
        downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
      });
      return result;
    },
  });
}
