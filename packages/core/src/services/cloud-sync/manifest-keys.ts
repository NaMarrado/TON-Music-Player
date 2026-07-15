import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
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

export function buildR2Endpoint(
  config: Pick<CloudStorageConfig, 'accountId' | 'jurisdiction'>,
): string {
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

export function normalizeContentHash(hash: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Cloud object content hash must be a 64-character SHA-256 hex digest');
  }
  return normalized;
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

export function buildCloudRevision(
  deviceId: string,
  now = Date.now(),
  random = Math.random(),
): string {
  const timestamp = new Date(now).toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  const suffix = Math.floor(random * 0xffffffff).toString(16).padStart(8, '0');
  return `${timestamp}-${deviceId}-${suffix}`;
}
