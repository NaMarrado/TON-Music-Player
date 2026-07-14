import type {
  CloudEntityVersionV2,
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudPlaylistRecordV2,
  CloudTrackEntry,
  CloudTrackRecordV2,
} from '../../types/cloud-sync';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function hasConsistentOptionalBlob(hash: unknown, objectKey: unknown): boolean {
  return hash === null
    ? objectKey === null
    : isSha256(hash) && isNonEmptyString(objectKey);
}

function isCloudEntityVersionV2(value: unknown): value is CloudEntityVersionV2 {
  return isObject(value)
    && isSafeNonNegativeInteger(value.counter)
    && isNonEmptyString(value.device_id);
}

const AUDIO_FORMATS = new Set(['opus', 'mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'webm']);

function isCloudTrackMetadata(value: unknown): boolean {
  if (!isObject(value)) return false;
  return isNullableString(value.title)
    && isNullableString(value.artist)
    && isNullableString(value.album)
    && isNullableString(value.album_artist)
    && isNullableString(value.genre)
    && isNullableFiniteNumber(value.track_number)
    && isNullableFiniteNumber(value.disc_number)
    && isNullableFiniteNumber(value.duration_ms)
    && isNullableFiniteNumber(value.year)
    && isNullableFiniteNumber(value.bitrate)
    && isNullableFiniteNumber(value.sample_rate)
    && isNullableFiniteNumber(value.loudness_lufs)
    && isNullableFiniteNumber(value.loudness_gain)
    && isNullableFiniteNumber(value.rating);
}

function isCloudTrackEntry(value: unknown, identity: string): value is CloudTrackEntry {
  if (!isObject(value)) return false;
  const downloadedAt = value.downloaded_at;
  return value.content_hash_sha256 === identity
    && isNonEmptyString(value.object_key)
    && isNonEmptyString(value.file_name)
    && (value.file_size === null || isSafeNonNegativeInteger(value.file_size))
    && (value.format === null
      || (typeof value.format === 'string' && AUDIO_FORMATS.has(value.format)))
    && hasConsistentOptionalBlob(value.artwork_hash_sha256, value.artwork_object_key)
    && isNullableString(value.artwork_file_name)
    && isNullableString(value.youtube_id)
    && isNullableString(value.spotify_id)
    && isNullableString(value.soundcloud_id)
    && isNullableString(value.source_url)
    && (downloadedAt === undefined || downloadedAt === null
      || isSafeNonNegativeInteger(downloadedAt))
    && isSafeNonNegativeInteger(value.added_at)
    && isSafeNonNegativeInteger(value.updated_at)
    && isCloudTrackMetadata(value.metadata);
}

function isCloudTrackRecordV2(value: unknown): value is CloudTrackRecordV2 {
  if (!isObject(value)
    || !isSha256(value.content_hash_sha256)
    || !isCloudEntityVersionV2(value.version)
    || typeof value.deleted !== 'boolean') {
    return false;
  }
  return value.deleted
    ? isSafeNonNegativeInteger(value.deleted_at)
    : isCloudTrackEntry(value.entry, value.content_hash_sha256);
}

function isCloudPlaylistEntry(value: unknown, identity: string): value is CloudPlaylistEntry {
  return isObject(value)
    && value.cloud_id === identity
    && typeof value.name === 'string'
    && isNullableString(value.description)
    && hasConsistentOptionalBlob(value.cover_hash_sha256, value.cover_object_key)
    && typeof value.is_smart === 'boolean'
    && isNullableString(value.smart_rules)
    && isSafeNonNegativeInteger(value.sort_order)
    && isSafeNonNegativeInteger(value.created_at)
    && isSafeNonNegativeInteger(value.updated_at)
    && Array.isArray(value.track_hashes)
    && value.track_hashes.every(isSha256);
}

function isCloudPlaylistRecordV2(value: unknown): value is CloudPlaylistRecordV2 {
  if (!isObject(value)
    || !isNonEmptyString(value.cloud_id)
    || !isCloudEntityVersionV2(value.version)
    || typeof value.deleted !== 'boolean') {
    return false;
  }
  return value.deleted
    ? isSafeNonNegativeInteger(value.deleted_at)
    : isCloudPlaylistEntry(value.entry, value.cloud_id);
}

/** Parse an untrusted R2 manifest before it can participate in merge or DB apply. */
export function parseCloudLibraryManifestV2(value: unknown): CloudLibraryManifestV2 | null {
  if (!isObject(value)
    || value.schema_version !== 2
    || value.app !== 'TON'
    || !isSafeNonNegativeInteger(value.created_at)
    || !isSafeNonNegativeInteger(value.updated_at)
    || !isNonEmptyString(value.writer_device_id)
    || !isNonEmptyString(value.revision)
    || !isSafeNonNegativeInteger(value.max_counter)
    || !Array.isArray(value.tracks)
    || !value.tracks.every(isCloudTrackRecordV2)
    || !Array.isArray(value.playlists)
    || !value.playlists.every(isCloudPlaylistRecordV2)) {
    return null;
  }
  const tracks = value.tracks as CloudTrackRecordV2[];
  const playlists = value.playlists as CloudPlaylistRecordV2[];
  if (new Set(tracks.map((record) => record.content_hash_sha256)).size !== tracks.length
    || new Set(playlists.map((record) => record.cloud_id)).size !== playlists.length) {
    return null;
  }
  const counters = [...tracks, ...playlists].map((record) => record.version.counter);
  if (value.max_counter < Math.max(0, ...counters)) {
    return null;
  }
  return value as unknown as CloudLibraryManifestV2;
}
