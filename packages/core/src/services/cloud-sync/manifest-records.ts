import type {
  CloudDeletedPlaylistRecordV2,
  CloudDeletedTrackRecordV2,
  CloudEntityVersionV2,
  CloudLibraryManifestV1,
  CloudLibraryManifestV2,
  CloudLivePlaylistRecordV2,
  CloudLiveTrackRecordV2,
  CloudPlaylistEntry,
  CloudTrackEntry,
} from '../../types/cloud-sync';
import { buildCloudRevision, normalizeContentHash } from './manifest-keys';

export function createEmptyCloudLibraryManifest(deviceId: string): CloudLibraryManifestV1 {
  const now = Date.now();
  return {
    schema_version: 1,
    app: 'TON',
    created_at: now,
    updated_at: now,
    device_id: deviceId,
    revision: buildCloudRevision(deviceId, now),
    library_track_hashes: [],
    tracks: [],
    playlists: [],
  };
}

export function createEmptyCloudLibraryManifestV2(
  deviceId: string,
  now = Date.now(),
  random = Math.random(),
): CloudLibraryManifestV2 {
  return {
    schema_version: 2,
    app: 'TON',
    created_at: now,
    updated_at: now,
    writer_device_id: deviceId,
    revision: buildCloudRevision(deviceId, now, random),
    max_counter: 0,
    tracks: [],
    playlists: [],
  };
}

export function normalizeLamportCounter(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(value));
}

export function compareCloudEntityVersions(
  left: CloudEntityVersionV2,
  right: CloudEntityVersionV2,
): number {
  const counterDelta = normalizeLamportCounter(left.counter) - normalizeLamportCounter(right.counter);
  if (counterDelta !== 0) {
    return counterDelta < 0 ? -1 : 1;
  }
  if (left.device_id === right.device_id) {
    return 0;
  }
  return left.device_id < right.device_id ? -1 : 1;
}

export function nextCloudEntityVersion(
  maxObservedCounter: number,
  deviceId: string,
): CloudEntityVersionV2 {
  const counter = normalizeLamportCounter(maxObservedCounter);
  if (counter >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Cloud entity Lamport counter is exhausted');
  }
  if (!deviceId.trim()) {
    throw new Error('Cloud entity version requires a device ID');
  }
  return { counter: counter + 1, device_id: deviceId };
}

export function createCloudLiveTrackRecordV2(
  entry: CloudTrackEntry,
  version: CloudEntityVersionV2,
): CloudLiveTrackRecordV2 {
  const contentHashSha256 = normalizeContentHash(entry.content_hash_sha256);
  return {
    content_hash_sha256: contentHashSha256,
    deleted: false,
    version,
    entry: entry.content_hash_sha256 === contentHashSha256
      ? entry
      : { ...entry, content_hash_sha256: contentHashSha256 },
  };
}

export function createCloudDeletedTrackRecordV2(
  contentHashSha256: string,
  version: CloudEntityVersionV2,
  deletedAt = Date.now(),
): CloudDeletedTrackRecordV2 {
  return {
    content_hash_sha256: normalizeContentHash(contentHashSha256),
    deleted: true,
    version,
    deleted_at: deletedAt,
  };
}

export function createCloudLivePlaylistRecordV2(
  entry: CloudPlaylistEntry,
  version: CloudEntityVersionV2,
): CloudLivePlaylistRecordV2 {
  return { cloud_id: entry.cloud_id, deleted: false, version, entry };
}

export function createCloudDeletedPlaylistRecordV2(
  cloudId: string,
  version: CloudEntityVersionV2,
  deletedAt = Date.now(),
): CloudDeletedPlaylistRecordV2 {
  return { cloud_id: cloudId, deleted: true, version, deleted_at: deletedAt };
}

/** Convert the old snapshot into deterministic V2 records for one-time bootstrap. */
export function convertCloudLibraryManifestV1ToV2(
  manifest: CloudLibraryManifestV1,
): CloudLibraryManifestV2 {
  let maxCounter = 0;
  const versionForTimestamp = (timestamp: number): CloudEntityVersionV2 => {
    const counter = Math.max(1, normalizeLamportCounter(timestamp));
    maxCounter = Math.max(maxCounter, counter);
    return { counter, device_id: manifest.device_id };
  };
  return {
    schema_version: 2,
    app: 'TON',
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    writer_device_id: manifest.device_id,
    revision: manifest.revision,
    max_counter: maxCounter,
    tracks: manifest.tracks.map((entry) => (
      createCloudLiveTrackRecordV2(entry, versionForTimestamp(entry.updated_at))
    )),
    playlists: manifest.playlists.map((entry) => (
      createCloudLivePlaylistRecordV2(entry, versionForTimestamp(entry.updated_at))
    )),
  };
}
