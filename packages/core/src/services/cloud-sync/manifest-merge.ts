import type {
  CloudLibraryManifestV1,
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudPlaylistRecordV2,
  CloudTrackEntry,
  CloudTrackRecordV2,
} from '../../types/cloud-sync';
import { normalizeContentHash } from './manifest-keys';
import { compareCloudEntityVersions, normalizeLamportCounter } from './manifest-records';

export function compareCloudTracksForLibrary(
  left: CloudTrackEntry,
  right: CloudTrackEntry,
): number {
  return right.added_at - left.added_at
    || left.content_hash_sha256.localeCompare(right.content_hash_sha256);
}

function stableRecordString(value: CloudTrackRecordV2 | CloudPlaylistRecordV2): string {
  return value.deleted ? `${value.deleted_at}` : JSON.stringify(value.entry);
}

function chooseRecordV2<T extends CloudTrackRecordV2 | CloudPlaylistRecordV2>(left: T, right: T): T {
  const versionComparison = compareCloudEntityVersions(left.version, right.version);
  if (versionComparison !== 0) {
    return versionComparison > 0 ? left : right;
  }
  if (left.deleted !== right.deleted) {
    return left.deleted ? left : right;
  }
  return stableRecordString(left) >= stableRecordString(right) ? left : right;
}

function earliestDownloadedAt(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  const values = [left, right].filter(
    (value): value is number => value != null && Number.isFinite(value) && value > 0,
  );
  return values.length > 0 ? Math.min(...values) : null;
}

function mergeTrackRecordsV2(
  left: CloudTrackRecordV2,
  right: CloudTrackRecordV2,
): CloudTrackRecordV2 {
  const preferred = chooseRecordV2(left, right);
  if (left.deleted || right.deleted || preferred.deleted) {
    return preferred;
  }
  return {
    ...preferred,
    entry: {
      ...preferred.entry,
      downloaded_at: earliestDownloadedAt(left.entry.downloaded_at, right.entry.downloaded_at),
    },
  };
}

function normalizeTrackRecordV2(record: CloudTrackRecordV2): CloudTrackRecordV2 {
  const contentHashSha256 = normalizeContentHash(record.content_hash_sha256);
  if (record.deleted) {
    return record.content_hash_sha256 === contentHashSha256
      ? record
      : { ...record, content_hash_sha256: contentHashSha256 };
  }
  if (record.content_hash_sha256 === contentHashSha256
    && record.entry.content_hash_sha256 === contentHashSha256) {
    return record;
  }
  return {
    ...record,
    content_hash_sha256: contentHashSha256,
    entry: { ...record.entry, content_hash_sha256: contentHashSha256 },
  };
}

export interface MergeCloudLibraryManifestsV2Options {
  writerDeviceId?: string;
  revision?: string;
  updatedAt?: number;
}

export function mergeCloudLibraryManifestsV2(
  remote: CloudLibraryManifestV2 | null,
  local: CloudLibraryManifestV2,
  options: MergeCloudLibraryManifestsV2Options = {},
): CloudLibraryManifestV2 {
  const tracks = new Map<string, CloudTrackRecordV2>();
  for (const rawRecord of [...(remote?.tracks ?? []), ...local.tracks]) {
    const record = normalizeTrackRecordV2(rawRecord);
    const previous = tracks.get(record.content_hash_sha256);
    tracks.set(record.content_hash_sha256, previous ? mergeTrackRecordsV2(previous, record) : record);
  }

  const playlists = new Map<string, CloudPlaylistRecordV2>();
  for (const record of [...(remote?.playlists ?? []), ...local.playlists]) {
    const previous = playlists.get(record.cloud_id);
    playlists.set(record.cloud_id, previous ? chooseRecordV2(previous, record) : record);
  }

  const trackRecords = [...tracks.values()].sort((left, right) => (
    left.content_hash_sha256.localeCompare(right.content_hash_sha256)
  ));
  const playlistRecords = [...playlists.values()].sort((left, right) => (
    left.cloud_id.localeCompare(right.cloud_id)
  ));
  const observedCounters = [
    remote?.max_counter ?? 0,
    local.max_counter,
    ...trackRecords.map((record) => record.version.counter),
    ...playlistRecords.map((record) => record.version.counter),
  ];

  return {
    schema_version: 2,
    app: 'TON',
    created_at: remote ? Math.min(remote.created_at, local.created_at) : local.created_at,
    updated_at: options.updatedAt
      ?? (remote ? Math.max(remote.updated_at, local.updated_at) : local.updated_at),
    writer_device_id: options.writerDeviceId ?? local.writer_device_id,
    revision: options.revision ?? local.revision,
    max_counter: Math.max(...observedCounters.map(normalizeLamportCounter)),
    tracks: trackRecords,
    playlists: playlistRecords,
  };
}

export function mergeCloudLibraryManifests(
  remote: CloudLibraryManifestV1 | null,
  local: CloudLibraryManifestV1,
): CloudLibraryManifestV1 {
  if (!remote) return local;

  const tracks = new Map<string, CloudTrackEntry>();
  for (const track of remote.tracks) tracks.set(track.content_hash_sha256, track);
  for (const track of local.tracks) {
    const previous = tracks.get(track.content_hash_sha256);
    const preferred = !previous || track.updated_at >= previous.updated_at ? track : previous;
    tracks.set(track.content_hash_sha256, {
      ...preferred,
      downloaded_at: earliestDownloadedAt(previous?.downloaded_at, track.downloaded_at),
    });
  }

  const playlists = new Map<string, CloudPlaylistEntry>();
  for (const playlist of remote.playlists) playlists.set(playlist.cloud_id, playlist);
  for (const playlist of local.playlists) {
    const previous = playlists.get(playlist.cloud_id);
    playlists.set(
      playlist.cloud_id,
      !previous || playlist.updated_at >= previous.updated_at ? playlist : previous,
    );
  }

  return {
    schema_version: 1,
    app: 'TON',
    created_at: Math.min(remote.created_at, local.created_at),
    updated_at: Math.max(remote.updated_at, local.updated_at),
    device_id: local.device_id,
    revision: local.revision,
    library_track_hashes: [...tracks.keys()],
    tracks: [...tracks.values()].sort(compareCloudTracksForLibrary),
    playlists: [...playlists.values()].sort((left, right) => (
      left.sort_order - right.sort_order || right.updated_at - left.updated_at
    )),
  };
}
