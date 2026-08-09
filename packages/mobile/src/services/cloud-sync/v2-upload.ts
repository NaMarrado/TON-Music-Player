import type {
  CloudLibraryManifestV2,
  CloudSyncResult,
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
  existingRemoteKeys: ReadonlySet<string>,
  result: CloudSyncResult,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<void> {
  if (!prepared) return;
  const referencedKeys = liveManifestObjectKeys(mutations);
  const referencedUploads = [...prepared.uploads.entries()].filter(
    ([key]) => referencedKeys.has(key) && !attemptedKeys.has(key),
  );
  const uploads = referencedUploads.filter(([key]) => !existingRemoteKeys.has(key));
  const pendingTrackGroups = new Set(
    uploads.map(([, upload]) => upload.progressGroup).filter(Boolean),
  );
  let completedTracks = 0;
  const progress = createTrackProgress(uploads.map(([, upload]) => upload));
  const uploadedGroups = new Set<string>();
  emitProgress(onProgress, {
    phase: 'uploading', current: completedTracks, total: pendingTrackGroups.size,
    uploaded: result.uploaded, skipped: result.skipped,
  });
  for (let index = 0; index < uploads.length; index += 1) {
    throwIfAborted(signal);
    const [key, upload] = uploads[index];
    const status = await client.uploadFile(
      key, upload.filePath, upload.contentType, upload.hash, { ifNoneMatch: '*', signal },
    );
    if (status === 'uploaded' && upload.progressGroup) {
      uploadedGroups.add(upload.progressGroup);
    }
    attemptedKeys.add(key);
    const completedPending = progress.complete(upload);
    const nextCompletedTracks = completedPending;
    if (nextCompletedTracks > completedTracks) {
      completedTracks = nextCompletedTracks;
      if (upload.progressGroup && uploadedGroups.has(upload.progressGroup)) result.uploaded += 1;
      else if (upload.progressGroup) result.skipped += 1;
    }
    emitProgress(onProgress, {
      phase: 'uploading', current: completedTracks, total: pendingTrackGroups.size,
      uploaded: result.uploaded, skipped: result.skipped,
    });
  }
}
