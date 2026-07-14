import type {
  CloudLibraryManifestV1,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudTrackEntry,
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
