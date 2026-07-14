import type { CloudSyncResult } from '@ton/core';
import { contentTypeForExtension, extensionForTrack } from './media';
import { uploadPendingCloudObjects, type PendingCloudObjectUpload } from './pending-object-uploader';
import { emitProgress, type LocalCloudArtwork } from './sync-common';
import type { RequiredV2Audio } from './v2-mutations';
import { DesktopR2Client } from './r2-client';
import { throwIfV2Cancelled, type V2SyncOptions } from './v2-types';

export function createV2ObjectUploader(input: {
  client: DesktopR2Client;
  options: V2SyncOptions;
  result: CloudSyncResult;
  requiredAudio: Map<string, RequiredV2Audio>;
  requiredArtwork: Map<string, LocalCloudArtwork>;
  repairObjectKeys: Set<string>;
}): () => Promise<void> {
  const { client, options, result, requiredAudio, requiredArtwork, repairObjectKeys } = input;
  const completedObjectKeys = new Set<string>();
  return async () => {
    const targets: PendingCloudObjectUpload[] = [];
    for (const required of requiredAudio.values()) {
      const { serialized } = required;
      targets.push({
        key: required.key,
        filePath: serialized.local.track.file_path,
        contentType: contentTypeForExtension(extensionForTrack(
          serialized.local.track.file_path,
          serialized.local.track.format,
        )),
        hash: serialized.entry.content_hash_sha256,
      });
    }
    targets.push(...requiredArtwork.values());
    const pendingCount = targets.filter((target) => !completedObjectKeys.has(target.key)).length;
    if (pendingCount === 0) return;
    emitProgress(options.onProgress, { phase: 'uploading', total: pendingCount });
    const uploadedBefore = result.uploaded;
    const skippedBefore = result.skipped;
    const batch = await uploadPendingCloudObjects(
      targets,
      completedObjectKeys,
      repairObjectKeys,
      {
        headObject: async (key) => {
          throwIfV2Cancelled(options);
          return client.headObject(key, options.signal);
        },
        uploadObject: async (target) => {
          throwIfV2Cancelled(options);
          const uploaded = await client.uploadFile(
            target.key, target.filePath, target.contentType, target.hash,
            { ifNoneMatch: '*', signal: options.signal },
          );
          return uploaded.status === 'ok' ? 'uploaded' : 'exists';
        },
      },
      (current, total, progress) => emitProgress(options.onProgress, {
        phase: 'uploading', current, total,
        uploaded: uploadedBefore + progress.uploaded,
        skipped: skippedBefore + progress.skipped,
      }),
    );
    result.uploaded += batch.uploaded;
    result.skipped += batch.skipped;
  };
}
