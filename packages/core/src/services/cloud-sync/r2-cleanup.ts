import type {
  CloudLibraryManifestV2,
  CloudR2CleanupPreview,
  CloudR2ObjectInfo,
} from '../../types/cloud-sync';
import { sha256Hex } from './r2-signing';
import {
  buildCloudRevision,
  normalizeCloudPrefix,
} from './manifest-keys';
import {
  createCloudDeletedTrackRecordV2,
  createCloudLivePlaylistRecordV2,
  nextCloudEntityVersion,
} from './manifest-records';

export interface CloudR2CleanupPlan {
  preview: CloudR2CleanupPreview;
  manifestEtag: string;
  localFingerprint: string;
  manifest: CloudLibraryManifestV2;
  objectKeysToDelete: string[];
  objectSizeByKey: ReadonlyMap<string, number>;
}

export interface BuildCloudR2CleanupPlanInput {
  manifest: CloudLibraryManifestV2;
  manifestEtag: string;
  storageScope: string;
  localHashes: Iterable<string>;
  objects: CloudR2ObjectInfo[];
  prefix: string;
  deviceId: string;
  now?: number;
  random?: number;
}

function normalizeHashes(hashes: Iterable<string>): string[] {
  return [...new Set([...hashes].map((hash) => hash.trim().toLowerCase()))].sort();
}

export function fingerprintCloudCleanupLibrary(hashes: Iterable<string>): string {
  return sha256Hex(normalizeHashes(hashes).join('\n'));
}

export function isTonManagedMediaObjectKey(prefix: string, key: string): boolean {
  const root = `${normalizeCloudPrefix(prefix)}/`;
  if (!key.startsWith(root)) return false;
  const relative = key.slice(root.length);
  return relative.startsWith('objects/audio/')
    || relative.startsWith('objects/artwork/')
    || relative.startsWith('library/tracks/')
    || relative.startsWith('library/artwork/')
    || (/^playlists\/[^/]+\/(tracks|artwork)\/.+/.test(relative));
}

export function getLiveCloudManifestObjectKeys(manifest: CloudLibraryManifestV2): Set<string> {
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

export function buildCloudR2CleanupPlan(
  input: BuildCloudR2CleanupPlanInput,
): CloudR2CleanupPlan {
  const now = input.now ?? Date.now();
  const localHashes = normalizeHashes(input.localHashes);
  const localHashSet = new Set(localHashes);
  const localFingerprint = fingerprintCloudCleanupLibrary(localHashes);
  const cloudOnlyHashes = new Set(
    input.manifest.tracks
      .filter((record) => !record.deleted && !localHashSet.has(record.content_hash_sha256))
      .map((record) => record.content_hash_sha256),
  );

  let counter = input.manifest.max_counter;
  let affectedPlaylists = 0;
  const tracks = input.manifest.tracks.map((record) => {
    if (record.deleted || !cloudOnlyHashes.has(record.content_hash_sha256)) return record;
    const version = nextCloudEntityVersion(counter, input.deviceId);
    counter = version.counter;
    return createCloudDeletedTrackRecordV2(record.content_hash_sha256, version, now);
  });
  const playlists = input.manifest.playlists.map((record) => {
    if (record.deleted || !record.entry.track_hashes.some((hash) => cloudOnlyHashes.has(hash))) {
      return record;
    }
    affectedPlaylists += 1;
    const version = nextCloudEntityVersion(counter, input.deviceId);
    counter = version.counter;
    return createCloudLivePlaylistRecordV2({
      ...record.entry,
      updated_at: now,
      track_hashes: record.entry.track_hashes.filter((hash) => !cloudOnlyHashes.has(hash)),
    }, version);
  });
  const revision = buildCloudRevision(input.deviceId, now, input.random);
  const manifest: CloudLibraryManifestV2 = {
    ...input.manifest,
    updated_at: now,
    writer_device_id: input.deviceId,
    revision,
    max_counter: counter,
    tracks,
    playlists,
  };

  const liveKeys = getLiveCloudManifestObjectKeys(manifest);
  const objectSizeByKey = new Map<string, number>();
  for (const object of input.objects) {
    if (!isTonManagedMediaObjectKey(input.prefix, object.key) || liveKeys.has(object.key)) continue;
    objectSizeByKey.set(object.key, Math.max(0, Math.trunc(object.size)));
  }
  const objectKeysToDelete = [...objectSizeByKey.keys()].sort();
  const reclaimableBytes = objectKeysToDelete.reduce(
    (sum, key) => sum + (objectSizeByKey.get(key) ?? 0),
    0,
  );
  const previewToken = sha256Hex(JSON.stringify({
    storageScope: input.storageScope,
    etag: input.manifestEtag,
    localFingerprint,
    revision: input.manifest.revision,
    cloudOnlyHashes: [...cloudOnlyHashes].sort(),
    objectsToDelete: objectKeysToDelete.map((key) => [key, objectSizeByKey.get(key) ?? 0]),
  }));

  return {
    preview: {
      previewToken,
      localTracks: localHashes.length,
      cloudTracks: input.manifest.tracks.filter((record) => !record.deleted).length,
      cloudOnlyTracks: cloudOnlyHashes.size,
      affectedPlaylists,
      objectsToDelete: objectKeysToDelete.length,
      reclaimableBytes,
    },
    manifestEtag: input.manifestEtag,
    localFingerprint,
    manifest,
    objectKeysToDelete,
    objectSizeByKey,
  };
}
