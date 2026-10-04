import type { ExportPlaylistEntry } from '../types/export';
import { validateProfileRecord, type ProfileSessionRecord } from '../services/listening-profile/records';
import { PROFILE_SETTING_VALIDATORS } from './settings';
import {
  PROFILE_BUNDLE_FORMAT,
  PROFILE_BUNDLE_VERSION,
  type ParsedProfileBundle,
  type ProfileBundle,
  type ProfileBundleInput,
  type ProfileBundlePlatform,
} from './types';

const MAX_STARRED = 500_000;
const MAX_PLAYLISTS = 5_000;
const MAX_LISTENING = 1_000_000;
const MAX_PLAYLIST_TRACKS = 100_000;
const PLATFORMS: readonly string[] = ['desktop', 'android', 'ios'];

/** How a song is recognised on every device: its content hash, or failing that its file hash. Null when it has neither. */
export function starIdentity(track: { content_hash_sha256?: string | null; file_hash?: string | null }): string | null {
  if (track.content_hash_sha256) return `sha256:${track.content_hash_sha256}`;
  if (track.file_hash) return `file:${track.file_hash}`;
  return null;
}

function portableSettings(raw: Record<string, string | null | undefined>): { kept: Record<string, string>; ignored: string[] } {
  const kept: Record<string, string> = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const validate = Object.hasOwn(PROFILE_SETTING_VALIDATORS, key) ? PROFILE_SETTING_VALIDATORS[key] : undefined;
    if (typeof value === 'string' && validate?.(value)) kept[key] = value;
    else ignored.push(key);
  }
  return { kept, ignored };
}

/** Builds the file content. Settings that are not on the allowlist (every secret, path and device id) never get in. */
export function buildProfileBundle(input: ProfileBundleInput, now: number = Date.now()): ProfileBundle {
  const { kept } = portableSettings(input.settings);
  return {
    format: PROFILE_BUNDLE_FORMAT,
    version: PROFILE_BUNDLE_VERSION,
    created_at: now,
    device_name: input.deviceName.slice(0, 256),
    platform: input.platform,
    settings: Object.fromEntries(Object.entries(kept).sort(([a], [b]) => a.localeCompare(b))),
    starred: [...new Set(input.starred)].sort(),
    playlists: input.playlists.map(normalisePlaylist),
    listening: input.listening,
  };
}

function normalisePlaylist(playlist: ExportPlaylistEntry): ExportPlaylistEntry {
  return {
    name: playlist.name,
    description: playlist.description,
    is_smart: playlist.is_smart,
    smart_rules: playlist.smart_rules,
    track_hashes: [...playlist.track_hashes],
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTextOrNull = (value: unknown, max: number): value is string | null => value === null || (typeof value === 'string' && value.length <= max);

function parsePlaylist(value: unknown): ExportPlaylistEntry {
  if (!isObject(value) || typeof value.name !== 'string' || value.name.trim() === '' || value.name.length > 512
    || !isTextOrNull(value.description ?? null, 8192) || typeof value.is_smart !== 'boolean' || !isTextOrNull(value.smart_rules ?? null, 100_000)
    || !Array.isArray(value.track_hashes) || value.track_hashes.length > MAX_PLAYLIST_TRACKS
    || !value.track_hashes.every((hash) => typeof hash === 'string' && hash.length > 0 && hash.length <= 256)) {
    throw new Error('The profile file contains a damaged playlist');
  }
  return {
    name: value.name,
    description: typeof value.description === 'string' ? value.description : null,
    is_smart: value.is_smart,
    smart_rules: typeof value.smart_rules === 'string' ? value.smart_rules : null,
    track_hashes: value.track_hashes.filter((hash): hash is string => typeof hash === 'string'),
  };
}

function parseRecord(value: unknown): ProfileSessionRecord {
  // Records are checked by the same validator the listening sync uses, so a file can never hold what the sync would refuse.
  const record = value as ProfileSessionRecord;
  try {
    validateProfileRecord(record, record.device.device_id);
  } catch {
    throw new Error('The profile file contains a damaged listening record');
  }
  return record;
}

/** Reads a profile file. Throws for anything that is not a valid TON profile; settings that must not be applied are reported. */
export function parseProfileBundle(text: string): ParsedProfileBundle {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This is not a TON profile file');
  }
  if (!isObject(value) || value.format !== PROFILE_BUNDLE_FORMAT) throw new Error('This is not a TON profile file');
  if (value.version !== PROFILE_BUNDLE_VERSION) throw new Error('This profile file was made by a newer version of TON');
  if (!Number.isSafeInteger(value.created_at) || typeof value.device_name !== 'string' || typeof value.platform !== 'string' || !PLATFORMS.includes(value.platform)) {
    throw new Error('The profile file header is damaged');
  }
  if (!isObject(value.settings)) throw new Error('The profile file settings are damaged');
  if (!Array.isArray(value.starred) || value.starred.length > MAX_STARRED || !value.starred.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256)) {
    throw new Error('The profile file starred songs are damaged');
  }
  if (!Array.isArray(value.playlists) || value.playlists.length > MAX_PLAYLISTS) throw new Error('The profile file playlists are damaged');
  if (!Array.isArray(value.listening) || value.listening.length > MAX_LISTENING) throw new Error('The profile file listening history is damaged');

  const stringSettings: Record<string, string | null> = {};
  for (const [key, setting] of Object.entries(value.settings)) stringSettings[key] = typeof setting === 'string' ? setting : null;
  const { kept, ignored } = portableSettings(stringSettings);
  const platform = value.platform as ProfileBundlePlatform;

  return {
    bundle: {
      format: PROFILE_BUNDLE_FORMAT,
      version: PROFILE_BUNDLE_VERSION,
      created_at: Number(value.created_at),
      device_name: value.device_name.slice(0, 256),
      platform,
      settings: kept,
      starred: value.starred.filter((id): id is string => typeof id === 'string'),
      playlists: value.playlists.map(parsePlaylist),
      listening: value.listening.map(parseRecord),
    },
    ignoredSettings: ignored,
  };
}
