import type { CloudSyncResult } from '@ton/core';
import { contentTypeForExtension, extensionForTrack } from './media';
import { uploadPendingCloudObjects, type PendingCloudObjectUpload } from './pending-object-uploader';
import { emitProgress, type LocalCloudArtwork } from './sync-common';
import type { RequiredV2Audio } from './v2-mutations';
import { DesktopR2Client } from './r2-client';
import { throwIfV2Cancelled, type SerializedTrack, type V2SyncOptions } from './v2-types';

export function createV2ObjectUploader(input: {
  client: DesktopR2Client;
  options: V2SyncOptions;
  result: CloudSyncResult;
  tracks: Map<number, SerializedTrack>;
  requiredAudio: Map<string, RequiredV2Audio>;
  requiredArtwork: Map<string, LocalCloudArtwork>;
  repairObjectKeys: Set<string>;
}): () => Promise<void> {
  const {
    client, options, result, tracks, requiredAudio, requiredArtwork, repairObjectKeys,
  } = input;
  const completedObjectKeys = new Set<string>();
  return async () => {
    const targets: PendingCloudObjectUpload[] = [];
    const remainingAudio = new Map(requiredAudio);
    const remainingArtwork = new Map(requiredArtwork);
    const addedTrackHashes = new Set<string>();
    for (const serialized of tracks.values()) {
      const trackHash = serialized.entry.content_hash_sha256;
      if (addedTrackHashes.has(trackHash)) continue;
      const audio = remainingAudio.get(trackHash);
      const artworkKey = serialized.entry.artwork_object_key;
      const artwork = artworkKey ? remainingArtwork.get(artworkKey) : undefined;
      if (!audio && !artwork) continue;
      addedTrackHashes.add(trackHash);
      if (audio) {
        targets.push({
          key: audio.key,
          filePath: audio.serialized.local.track.file_path,
          contentType: contentTypeForExtension(extensionForTrack(
            audio.serialized.local.track.file_path,
            audio.serialized.local.track.format,
          )),
          hash: trackHash,
          progressGroup: trackHash,
        });
        remainingAudio.delete(trackHash);
      }
      if (artwork) {
        targets.push({ ...artwork, progressGroup: trackHash });
        remainingArtwork.delete(artwork.key);
      }
    }
    for (const [trackHash, audio] of remainingAudio) {
      targets.push({
        key: audio.key,
        filePath: audio.serialized.local.track.file_path,
        contentType: contentTypeForExtension(extensionForTrack(
          audio.serialized.local.track.file_path,
          audio.serialized.local.track.format,
        )),
        hash: trackHash,
        progressGroup: trackHash,
      });
    }
    targets.push(...remainingArtwork.values());
    const pending = targets.filter((target) => !completedObjectKeys.has(target.key));
    if (pending.length === 0) return;
    const pendingTracks = new Set(
      pending.flatMap((target) => target.progressGroup ? [target.progressGroup] : []),
    ).size;
    emitProgress(options.onProgress, { phase: 'uploading', total: pendingTracks });
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
