import type {
  CloudLibraryManifestV2,
  CloudSyncResult,
  CloudTrackRecordV2,
  CloudPlaylistRecordV2,
} from '@ton/core';
import { MobileR2Client } from './r2-client';
import {
  emitProgress,
  throwIfAborted,
  type MobileCloudV2SyncOptions,
  type PreparedLocalManifest,
} from './v2-common';

type PreparedUpload = PreparedLocalManifest['uploads'] extends Map<string, infer Upload>
  ? Upload
  : never;

function createTrackProgress(uploads: PreparedUpload[]): {
  total: number;
  complete: (upload: PreparedUpload) => number;
} {
  const remaining = new Map<string, number>();
  for (const upload of uploads) {
    if (!upload.progressGroup) continue;
    remaining.set(upload.progressGroup, (remaining.get(upload.progressGroup) ?? 0) + 1);
  }
  let completed = 0;
  return {
    total: remaining.size,
    complete: (upload) => {
      if (!upload.progressGroup) return completed;
      const next = (remaining.get(upload.progressGroup) ?? 1) - 1;
      if (next <= 0) {
        remaining.delete(upload.progressGroup);
        completed += 1;
      } else {
        remaining.set(upload.progressGroup, next);
      }
      return completed;
    },
  };
}

export function liveManifestObjectKeys(manifest: CloudLibraryManifestV2): Set<string> {
  const keys = new Set<string>();
  for (const record of manifest.tracks) {
    if (record.deleted) continue;
    keys.add(record.entry.object_key);
    if (record.entry.artwork_object_key) keys.add(record.entry.artwork_object_key);
  }
  for (const record of manifest.playlists) {
    if (!record.deleted && record.entry.cover_object_key) keys.add(record.entry.cover_object_key);
  }
  return keys;
}

export async function uploadPreparedObjects(
  client: MobileR2Client,
  prepared: PreparedLocalManifest | null,
  mutations: CloudLibraryManifestV2,
  attemptedKeys: Set<string>,
  result: CloudSyncResult,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  if (!prepared) return;
  const referencedKeys = liveManifestObjectKeys(mutations);
  const uploads = [...prepared.uploads.entries()].filter(
    ([key]) => referencedKeys.has(key) && !attemptedKeys.has(key),
  );
  const progress = createTrackProgress(uploads.map(([, upload]) => upload));
  emitProgress(onProgress, { phase: 'uploading', total: progress.total });
  for (let index = 0; index < uploads.length; index += 1) {
    throwIfAborted(signal);
    const [key, upload] = uploads[index];
    const status = await client.uploadFile(
      key, upload.filePath, upload.contentType, upload.hash, { ifNoneMatch: '*', signal },
    );
    if (status === 'uploaded') result.uploaded += 1;
    else result.skipped += 1;
    attemptedKeys.add(key);
    emitProgress(onProgress, {
      phase: 'uploading', current: progress.complete(upload), total: progress.total,
      uploaded: result.uploaded, skipped: result.skipped,
    });
  }
}

export async function repairMissingPublishedObjects(
  client: MobileR2Client,
  prepared: PreparedLocalManifest | null,
  remote: CloudLibraryManifestV2,
  attemptedKeys: Set<string>,
  result: CloudSyncResult,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  if (!prepared || prepared.incremental) return;
  const localTracks = new Map(
    prepared.manifest.tracks
      .filter((record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted)
      .map((record) => [record.content_hash_sha256, record.entry]),
  );
  const localPlaylists = new Map(
    prepared.manifest.playlists
      .filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted)
      .map((record) => [record.cloud_id, record.entry]),
  );
  const targets = new Map<string, PreparedUpload>();
  for (const record of remote.tracks) {
    if (record.deleted) continue;
    const local = localTracks.get(record.content_hash_sha256);
    if (!local) continue;
    const audio = prepared.uploads.get(local.object_key);
    if (audio) targets.set(record.entry.object_key, {
      ...audio,
      progressGroup: record.content_hash_sha256,
    });
    if (local.artwork_hash_sha256
        && local.artwork_hash_sha256 === record.entry.artwork_hash_sha256
        && local.artwork_object_key && record.entry.artwork_object_key) {
      const artwork = prepared.uploads.get(local.artwork_object_key);
      if (artwork) targets.set(record.entry.artwork_object_key, {
        ...artwork,
        progressGroup: record.content_hash_sha256,
      });
    }
  }
  for (const record of remote.playlists) {
    if (record.deleted) continue;
    const local = localPlaylists.get(record.cloud_id);
    if (!local?.cover_hash_sha256
        || local.cover_hash_sha256 !== record.entry.cover_hash_sha256
        || !local.cover_object_key || !record.entry.cover_object_key) continue;
    const cover = prepared.uploads.get(local.cover_object_key);
    if (cover) targets.set(record.entry.cover_object_key, { ...cover, progressGroup: null });
  }
  const pending = [...targets.entries()].filter(([key]) => !attemptedKeys.has(key));
  const progress = createTrackProgress(pending.map(([, upload]) => upload));
  emitProgress(onProgress, { phase: 'uploading', total: progress.total });
  for (let index = 0; index < pending.length; index += 1) {
    throwIfAborted(signal);
    const [key, upload] = pending[index];
    if (await client.headObject(key, signal)) {
      result.skipped += 1;
    } else {
      const status = await client.uploadFile(
        key, upload.filePath, upload.contentType, upload.hash, { ifNoneMatch: '*', signal },
      );
      if (status === 'uploaded') result.uploaded += 1;
      else result.skipped += 1;
    }
    attemptedKeys.add(key);
    emitProgress(onProgress, {
      phase: 'uploading', current: progress.complete(upload), total: progress.total,
      uploaded: result.uploaded, skipped: result.skipped,
    });
  }
}
