import type {
  CloudLibraryManifestV2,
  CloudR2CleanupPlan,
  CloudR2CleanupPreview,
  CloudR2CleanupResult,
  CloudSyncProgress,
  Track,
} from '@ton/core';
import {
  buildCloudR2CleanupPlan,
  buildCloudV2CommitObjectKey,
  buildCloudV2ManifestObjectKey,
  executeCloudR2CleanupPlan,
  normalizeCloudPrefix,
  parseCloudLibraryManifestV2,
} from '@ton/core';
import { getDb } from '../database';
import {
  getActiveDesktopCloudScope,
  setDesktopCloudOutboxSuppressed,
  updateDesktopCloudSyncState,
} from './auto-sync-store';
import {
  getDesktopCloudDeviceId,
  setDesktopCloudLastRevision,
} from './config';
import { ensureTrackContentHash } from './v1-local-manifest';
import {
  clearDesktopCloudDownloadFailures,
  listDesktopCloudDownloadFailures,
} from './download-failures';
import { DesktopR2Client } from './r2-client';
import { requireConfig } from './sync-common';

type ProgressCallback = (progress: CloudSyncProgress) => void;

const cachedPlans = new Map<string, CloudR2CleanupPlan>();

function emitProgress(
  callback: ProgressCallback | undefined,
  patch: Partial<CloudSyncProgress>,
): void {
  callback?.({
    phase: 'analyzing-cleanup', current: 0, total: 0,
    uploaded: 0, downloaded: 0, skipped: 0, failed: 0,
    ...patch,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('cloud_sync_cancelled');
}

async function collectLocalHashes(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<string[]> {
  const tracks = getDb().prepare('SELECT * FROM tracks ORDER BY id').all() as Track[];
  const hashes = new Set<string>();
  emitProgress(onProgress, { phase: 'analyzing-cleanup', total: tracks.length });
  for (let index = 0; index < tracks.length; index += 1) {
    throwIfAborted(signal);
    const hash = await ensureTrackContentHash(tracks[index]);
    if (!hash) throw new Error('cloud_cleanup_local_file_unreadable');
    hashes.add(hash.toLowerCase());
    emitProgress(onProgress, {
      phase: 'analyzing-cleanup', current: index + 1, total: tracks.length,
    });
  }
  return [...hashes];
}

async function buildCurrentPlan(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CloudR2CleanupPlan> {
  const config = requireConfig();
  const client = new DesktopR2Client(config);
  const localHashes = await collectLocalHashes(onProgress, signal);
  throwIfAborted(signal);
  const read = await client.getJsonConditional<CloudLibraryManifestV2>(
    buildCloudV2ManifestObjectKey(config.prefix),
    { signal },
  );
  const manifest = read.status === 'ok' ? parseCloudLibraryManifestV2(read.value) : null;
  if (!manifest || read.status !== 'ok' || !read.etag) {
    throw new Error('cloud_cleanup_manifest_missing');
  }
  const [objects, failures] = await Promise.all([
    client.listObjects(`${normalizeCloudPrefix(config.prefix)}/`, signal),
    Promise.resolve(listDesktopCloudDownloadFailures(getActiveDesktopCloudScope() ?? '')),
  ]);
  throwIfAborted(signal);
  return buildCloudR2CleanupPlan({
    manifest,
    manifestEtag: read.etag,
    storageScope: [
      config.accountId,
      config.bucket,
      config.jurisdiction,
      normalizeCloudPrefix(config.prefix),
    ].join('\n'),
    localHashes,
    objects,
    prefix: config.prefix,
    deviceId: getDesktopCloudDeviceId(),
    failures,
  });
}

function storeDesktopCleanupMirror(
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  etag: string,
): void {
  setDesktopCloudOutboxSuppressed(() => {
    getDb().transaction(() => {
      const upsert = getDb().prepare(`
        INSERT OR REPLACE INTO cloud_sync_entities (
          scope_id, entity_type, entity_key, record_json, version_counter,
          version_device_id, is_deleted, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
      `);
      for (const record of manifest.tracks) {
        upsert.run(
          scopeId, 'track', record.content_hash_sha256, JSON.stringify(record),
          record.version.counter, record.version.device_id, record.deleted ? 1 : 0,
        );
      }
      for (const record of manifest.playlists) {
        upsert.run(
          scopeId, 'playlist', record.cloud_id, JSON.stringify(record),
          record.version.counter, record.version.device_id, record.deleted ? 1 : 0,
        );
      }
    })();
  });
  updateDesktopCloudSyncState(scopeId, {
    revision: manifest.revision,
    etag,
    lamport_counter: manifest.max_counter,
    last_success_at: Date.now(),
    last_error: null,
    next_retry_at: null,
    pending_remote_revision: null,
  });
  setDesktopCloudLastRevision(manifest.revision);
}

export async function previewDesktopCloudCleanup(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CloudR2CleanupPreview> {
  const plan = await buildCurrentPlan(onProgress, signal);
  cachedPlans.clear();
  cachedPlans.set(plan.preview.previewToken, plan);
  return plan.preview;
}

export async function executeDesktopCloudCleanup(
  previewToken: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CloudR2CleanupResult> {
  const expected = cachedPlans.get(previewToken);
  const current = await buildCurrentPlan(onProgress, signal);
  if (!expected || current.preview.previewToken !== previewToken) {
    cachedPlans.clear();
    cachedPlans.set(current.preview.previewToken, current);
    return {
      status: 'stale', deletedTracks: 0, updatedPlaylists: 0,
      deletedObjects: 0, failedObjects: 0, freedBytes: 0, revision: null,
      refreshedPreview: current.preview,
    };
  }

  const config = requireConfig();
  const scopeId = getActiveDesktopCloudScope();
  if (!scopeId) throw new Error('cloud_cleanup_not_configured');
  const client = new DesktopR2Client(config);
  emitProgress(onProgress, {
    phase: 'cleaning', total: current.objectKeysToDelete.length,
  });
  const result = await executeCloudR2CleanupPlan(current, {
    publishManifest: async (plan, executionSignal) => {
      const write = await client.putJsonConditional(
        buildCloudV2ManifestObjectKey(config.prefix),
        plan.manifest,
        { ifMatch: plan.manifestEtag, signal: executionSignal },
      );
      if (write.status === 'precondition-failed') return { status: 'stale' };
      if (write.etag) return { status: 'ok', etag: write.etag };
      const verified = await client.getJsonConditional<CloudLibraryManifestV2>(
        buildCloudV2ManifestObjectKey(config.prefix),
        { signal: executionSignal },
      );
      if (verified.status !== 'ok' || !verified.etag) throw new Error('cloud_sync_missing_etag');
      return { status: 'ok', etag: verified.etag };
    },
    commitLocalState: async (plan, etag) => {
      storeDesktopCleanupMirror(scopeId, plan.manifest, etag);
      clearDesktopCloudDownloadFailures(
        scopeId,
        plan.preview.failuresToClear.map((failure) => failure.contentHash),
      );
    },
    writeCommit: (plan, executionSignal) => client.putJson(
      buildCloudV2CommitObjectKey(config.prefix, plan.manifest.revision),
      plan.manifest,
      executionSignal,
    ),
    deleteObject: (key, executionSignal) => client.deleteObject(key, executionSignal),
  }, { signal, onProgress });

  if (result.status === 'stale') {
    const refreshed = await buildCurrentPlan(onProgress, signal);
    cachedPlans.clear();
    cachedPlans.set(refreshed.preview.previewToken, refreshed);
    return {
      status: 'stale', deletedTracks: 0, updatedPlaylists: 0,
      deletedObjects: 0, failedObjects: 0, freedBytes: 0, revision: null,
      refreshedPreview: refreshed.preview,
    };
  }
  cachedPlans.clear();
  return result;
}
