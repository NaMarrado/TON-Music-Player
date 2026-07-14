import type {
  CloudDeletedPlaylistRecordV2,
  CloudDeletedTrackRecordV2,
  CloudEntityVersionV2,
  CloudLibraryManifestV1,
  CloudLibraryManifestV2,
  CloudLivePlaylistRecordV2,
  CloudLiveTrackRecordV2,
  CloudPlaylistEntry,
  CloudPlaylistRecordV2,
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudTrackEntry,
  CloudTrackRecordV2,
} from '../../types/cloud-sync';
import { sanitizeFilename } from '../../utils/sanitize-filename';

export interface CloudTrackObjectNameInput {
  title?: string | null;
  artist?: string | null;
  fileName?: string | null;
}

export interface CloudPlaylistObjectNameInput {
  name: string;
  cloudId?: string | null;
}

const JURISDICTION_ENDPOINT_SUFFIX: Record<CloudStorageJurisdiction, string> = {
  default: 'r2.cloudflarestorage.com',
  eu: 'eu.r2.cloudflarestorage.com',
  fedramp: 'fedramp.r2.cloudflarestorage.com',
};

export function normalizeCloudPrefix(prefix: string | null | undefined): string {
  const trimmed = (prefix ?? 'ton').trim().replace(/^\/+|\/+$/g, '');
  return trimmed || 'ton';
}

export function buildR2Endpoint(config: Pick<CloudStorageConfig, 'accountId' | 'jurisdiction'>): string {
  return `https://${config.accountId}.${JURISDICTION_ENDPOINT_SUFFIX[config.jurisdiction]}`;
}

export function buildCloudManifestObjectKey(prefix: string): string {
  return `${normalizeCloudPrefix(prefix)}/system/manifest.json`;
}

export function buildCloudCommitObjectKey(prefix: string, revision: string): string {
  return `${normalizeCloudPrefix(prefix)}/system/commits/${revision}.json`;
}

export function buildCloudV2ManifestObjectKey(prefix: string): string {
  return `${normalizeCloudPrefix(prefix)}/system/v2/manifest.json`;
}

export function buildCloudV2CommitObjectKey(prefix: string, revision: string): string {
  return `${normalizeCloudPrefix(prefix)}/system/v2/commits/${revision}.json`;
}

/** Permanent proof that a V2 head completed at least one successful CAS. */
export function buildCloudV2ActivationObjectKey(prefix: string): string {
  return `${normalizeCloudPrefix(prefix)}/system/v2/.activated`;
}

export function buildCloudConnectionTestObjectKey(prefix: string): string {
  return `${normalizeCloudPrefix(prefix)}/system/.connection-test`;
}

export function buildLegacyCloudManifestObjectKey(prefix: string): string {
  return `${normalizeCloudPrefix(prefix)}/v1/manifest.json`;
}

export function buildLegacyCloudCommitObjectKey(prefix: string, revision: string): string {
  return `${normalizeCloudPrefix(prefix)}/v1/commits/${revision}.json`;
}

export function buildLegacyCloudConnectionTestObjectKey(prefix: string): string {
  return `${normalizeCloudPrefix(prefix)}/v1/.connection-test`;
}

function cleanExtension(ext: string): string {
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  return cleanExt === '.' ? '' : cleanExt;
}

function normalizeContentHash(hash: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Cloud object content hash must be a 64-character SHA-256 hex digest');
  }
  return normalized;
}

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

function hasConsistentOptionalBlob(
  hash: unknown,
  objectKey: unknown,
): boolean {
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
    && (value.file_size === null
      || (isSafeNonNegativeInteger(value.file_size)))
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

/**
 * Parse an untrusted R2 manifest before it can participate in a merge or DB
 * apply. In particular, `deleted` must be an actual boolean: treating a string
 * like `"false"` as truthy could otherwise turn a malformed live record into a
 * destructive tombstone.
 */
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
  let maximumEntityCounter = 0;
  for (const record of tracks) {
    maximumEntityCounter = Math.max(maximumEntityCounter, record.version.counter);
  }
  for (const record of playlists) {
    maximumEntityCounter = Math.max(maximumEntityCounter, record.version.counter);
  }
  if (value.max_counter < maximumEntityCounter) {
    return null;
  }
  return value as unknown as CloudLibraryManifestV2;
}

export function buildCloudContentAudioObjectKey(
  prefix: string,
  hash: string,
  ext: string,
): string {
  const normalizedHash = normalizeContentHash(hash);
  return `${normalizeCloudPrefix(prefix)}/objects/audio/${normalizedHash}${cleanExtension(ext).toLowerCase()}`;
}

export function buildCloudContentArtworkObjectKey(
  prefix: string,
  hash: string,
  ext: string,
): string {
  const normalizedHash = normalizeContentHash(hash);
  return `${normalizeCloudPrefix(prefix)}/objects/artwork/${normalizedHash}${cleanExtension(ext).toLowerCase()}`;
}

function stripExtension(fileName: string | null | undefined): string {
  if (!fileName) {
    return '';
  }
  const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  const basename = lastSlash >= 0 ? fileName.slice(lastSlash + 1) : fileName;
  const lastDot = basename.lastIndexOf('.');
  return lastDot > 0 ? basename.slice(0, lastDot) : basename;
}

function safePathSegment(value: string | null | undefined, fallback: string): string {
  const sanitized = sanitizeFilename(value ?? '').replace(/\.+$/g, '').trim();
  return sanitized || fallback;
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function buildTrackBaseName(track: CloudTrackObjectNameInput | undefined, hash: string): string {
  const artist = safePathSegment(track?.artist, 'Unknown Artist');
  const title = safePathSegment(track?.title || stripExtension(track?.fileName), 'Unknown Track');
  return `${artist} - ${title} [${shortHash(hash)}]`;
}

export function buildCloudPlaylistFolderName(playlist: CloudPlaylistObjectNameInput): string {
  const name = safePathSegment(playlist.name, 'Untitled Playlist');
  const cloudId = safePathSegment(playlist.cloudId?.replace(/^playlist-/, ''), '').slice(-8);
  return cloudId ? `${name} [${cloudId}]` : name;
}

export function buildCloudLibraryAudioObjectKey(
  prefix: string,
  hash: string,
  ext: string,
  track?: CloudTrackObjectNameInput,
): string {
  return `${normalizeCloudPrefix(prefix)}/library/tracks/${buildTrackBaseName(track, hash)}${cleanExtension(ext)}`;
}

export function buildCloudPlaylistAudioObjectKey(
  prefix: string,
  playlist: CloudPlaylistObjectNameInput,
  position: number,
  hash: string,
  ext: string,
  track?: CloudTrackObjectNameInput,
): string {
  const itemPrefix = `${String(position + 1).padStart(3, '0')} - `;
  return `${normalizeCloudPrefix(prefix)}/playlists/${buildCloudPlaylistFolderName(playlist)}/tracks/${itemPrefix}${buildTrackBaseName(track, hash)}${cleanExtension(ext)}`;
}

export function buildCloudLibraryArtworkObjectKey(
  prefix: string,
  hash: string,
  ext: string,
  track?: CloudTrackObjectNameInput,
): string {
  return `${normalizeCloudPrefix(prefix)}/library/artwork/${buildTrackBaseName(track, hash)}${cleanExtension(ext)}`;
}

export function buildCloudPlaylistCoverObjectKey(
  prefix: string,
  playlist: CloudPlaylistObjectNameInput,
  hash: string,
  ext: string,
): string {
  return `${normalizeCloudPrefix(prefix)}/playlists/${buildCloudPlaylistFolderName(playlist)}/artwork/cover [${shortHash(hash)}]${cleanExtension(ext)}`;
}

export function buildCloudAudioObjectKey(prefix: string, hash: string, ext: string): string {
  return buildCloudLibraryAudioObjectKey(prefix, hash, ext);
}

export function buildCloudArtworkObjectKey(prefix: string, hash: string, ext: string): string {
  return buildCloudLibraryArtworkObjectKey(prefix, hash, ext);
}

export function buildCloudRevision(deviceId: string, now = Date.now(), random = Math.random()): string {
  const timestamp = new Date(now).toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  const suffix = Math.floor(random * 0xffffffff).toString(16).padStart(8, '0');
  return `${timestamp}-${deviceId}-${suffix}`;
}

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

function normalizeLamportCounter(value: number): number {
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
  return {
    cloud_id: entry.cloud_id,
    deleted: false,
    version,
    entry,
  };
}

export function createCloudDeletedPlaylistRecordV2(
  cloudId: string,
  version: CloudEntityVersionV2,
  deletedAt = Date.now(),
): CloudDeletedPlaylistRecordV2 {
  return {
    cloud_id: cloudId,
    deleted: true,
    version,
    deleted_at: deletedAt,
  };
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
  const tracks = manifest.tracks.map((entry) => (
    createCloudLiveTrackRecordV2(entry, versionForTimestamp(entry.updated_at))
  ));
  const playlists = manifest.playlists.map((entry) => (
    createCloudLivePlaylistRecordV2(entry, versionForTimestamp(entry.updated_at))
  ));

  return {
    schema_version: 2,
    app: 'TON',
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    writer_device_id: manifest.device_id,
    revision: manifest.revision,
    max_counter: maxCounter,
    tracks,
    playlists,
  };
}

function stableRecordString(value: CloudTrackRecordV2 | CloudPlaylistRecordV2): string {
  if (value.deleted) {
    return `${value.deleted_at}`;
  }
  return JSON.stringify(value.entry);
}

function chooseRecordV2<T extends CloudTrackRecordV2 | CloudPlaylistRecordV2>(
  left: T,
  right: T,
): T {
  const versionComparison = compareCloudEntityVersions(left.version, right.version);
  if (versionComparison !== 0) {
    return versionComparison > 0 ? left : right;
  }
  if (left.deleted !== right.deleted) {
    return left.deleted ? left : right;
  }

  // Identical versions should represent the same mutation. This final fallback
  // makes malformed/split-brain input merge commutatively instead of depending
  // on argument order.
  const leftValue = stableRecordString(left);
  const rightValue = stableRecordString(right);
  return leftValue >= rightValue ? left : right;
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
  if (
    record.content_hash_sha256 === contentHashSha256
    && record.entry.content_hash_sha256 === contentHashSha256
  ) {
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
    tracks.set(
      record.content_hash_sha256,
      previous ? mergeTrackRecordsV2(previous, record) : record,
    );
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
  if (!remote) {
    return local;
  }

  const tracks = new Map<string, CloudTrackEntry>();
  for (const track of remote.tracks) {
    tracks.set(track.content_hash_sha256, track);
  }
  for (const track of local.tracks) {
    const previous = tracks.get(track.content_hash_sha256);
    const preferred = !previous || track.updated_at >= previous.updated_at ? track : previous;
    const downloadedAt = earliestDownloadedAt(previous?.downloaded_at, track.downloaded_at);
    tracks.set(
      track.content_hash_sha256,
      { ...preferred, downloaded_at: downloadedAt },
    );
  }

  const playlists = new Map<string, CloudPlaylistEntry>();
  for (const playlist of remote.playlists) {
    playlists.set(playlist.cloud_id, playlist);
  }
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
    tracks: [...tracks.values()].sort((left, right) => right.added_at - left.added_at),
    playlists: [...playlists.values()].sort((left, right) => (
      left.sort_order - right.sort_order || right.updated_at - left.updated_at
    )),
  };
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
