import type { CloudSyncResult } from '@ton/core';
import {
  buildCloudPlaylistFolderName,
  mergeCloudLibraryManifests,
  normalizeCloudPrefix,
} from '@ton/core';
import { DesktopR2Client } from './r2-client';
import { contentTypeForExtension, extensionForTrack } from './media';
import {
  EMPTY_RESULT,
  emitProgress,
  requireConfig,
  throwIfCancelled,
  type CancelSignal,
  type ProgressCallback,
} from './sync-common';
import { buildLocalManifest } from './v1-local-manifest';
import {
  addManagedPlaylistKey,
  cleanupLegacyCloudLayout,
  cleanupReadablePlaylistObjects,
  readRemoteManifest,
  writeRemoteManifest,
} from './v1-remote-manifest';

type UploadTarget = { key: string; filePath: string; contentType: string; hash: string };

export async function uploadMissingLocalToCloud(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  const config = requireConfig();
  const client = new DesktopR2Client(config);
  const result: CloudSyncResult = { ...EMPTY_RESULT };
  const { manifest, localTracks, localArtworks } = await buildLocalManifest(config, onProgress, shouldCancel);
  const remoteManifest = await readRemoteManifest(client, config);
  const uploadTargets = new Map<string, UploadTarget>();
  const addTarget = (target: UploadTarget): void => {
    if (!uploadTargets.has(target.key)) uploadTargets.set(target.key, target);
  };
  const managedPlaylistKeys = new Map<string, Set<string>>();
  const cloudRoot = normalizeCloudPrefix(config.prefix);

  for (const entry of localTracks) {
    addTarget({
      key: entry.audioObjectKey,
      filePath: entry.track.file_path,
      contentType: contentTypeForExtension(extensionForTrack(entry.track.file_path, entry.track.format)),
      hash: entry.contentHash,
    });
  }
  for (const playlist of manifest.playlists) {
    const folder = buildCloudPlaylistFolderName({ name: playlist.name, cloudId: playlist.cloud_id });
    managedPlaylistKeys.set(`${cloudRoot}/playlists/${folder}/tracks/`, new Set());
    addManagedPlaylistKey(
      managedPlaylistKeys,
      `${cloudRoot}/playlists/${folder}/artwork/`,
      playlist.cover_object_key,
    );
  }
  for (const artwork of localArtworks) addTarget(artwork);

  const targets = [...uploadTargets.values()];
  emitProgress(onProgress, { phase: 'uploading', total: targets.length });
  for (let index = 0; index < targets.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const target = targets[index];
    if (await client.headObject(target.key)) {
      result.skipped += 1;
    } else {
      await client.uploadFile(target.key, target.filePath, target.contentType, target.hash);
      result.uploaded += 1;
    }
    emitProgress(onProgress, {
      phase: 'uploading', current: index + 1, total: targets.length,
      uploaded: result.uploaded, skipped: result.skipped,
    });
  }

  const merged = mergeCloudLibraryManifests(remoteManifest, manifest);
  merged.revision = manifest.revision;
  merged.updated_at = Date.now();
  emitProgress(onProgress, {
    phase: 'writing-manifest', current: 0, total: 1,
    uploaded: result.uploaded, skipped: result.skipped,
  });
  throwIfCancelled(shouldCancel);
  await writeRemoteManifest(client, config, merged);
  await cleanupLegacyCloudLayout(client, config, merged);
  await cleanupReadablePlaylistObjects(client, managedPlaylistKeys);
  result.revision = merged.revision;
  emitProgress(onProgress, {
    phase: 'done', current: 1, total: 1,
    uploaded: result.uploaded, skipped: result.skipped,
  });
  return result;
}
