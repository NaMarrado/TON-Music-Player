import { validateProfileRecord, type ProfileSessionRecord } from '../services/listening-profile/records';
import type { CloudStorageConfig, CloudStorageJurisdiction } from '../types/cloud-sync';
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
const MAX_LISTENING = 1_000_000;
const PLATFORMS: readonly string[] = ['desktop', 'android', 'ios'];
const JURISDICTIONS: Record<CloudStorageJurisdiction, true> = { default: true, eu: true, fedramp: true };

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

/** Builds the profile part of a Profile export. Settings that belong to this device only never get in. */
export function buildProfileBundle(input: ProfileBundleInput, now: number = Date.now()): ProfileBundle {
  const { kept } = portableSettings(input.settings);
  return {
    format: PROFILE_BUNDLE_FORMAT,
    version: PROFILE_BUNDLE_VERSION,
    created_at: now,
    device_name: input.deviceName.slice(0, 256),
    platform: input.platform,
    settings: Object.fromEntries(Object.entries(kept).sort(([a], [b]) => a.localeCompare(b))),
    cloud: input.cloud ? { ...input.cloud } : null,
    starred: [...new Set(input.starred)].sort(),
    listening: input.listening,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isShortText = (value: unknown): value is string => typeof value === 'string' && value.length <= 1024;

function parseCloud(value: unknown): CloudStorageConfig | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || !isShortText(value.accountId) || !isShortText(value.bucket) || !isShortText(value.prefix)
    || !isShortText(value.accessKeyId) || !isShortText(value.secretAccessKey)
    || typeof value.jurisdiction !== 'string' || !Object.hasOwn(JURISDICTIONS, value.jurisdiction)) {
    throw new Error('The profile cloud connection is damaged');
  }
  return {
    accountId: value.accountId,
    bucket: value.bucket,
    prefix: value.prefix,
    accessKeyId: value.accessKeyId,
    secretAccessKey: value.secretAccessKey,
    // Checked against the table above.
    jurisdiction: value.jurisdiction as CloudStorageJurisdiction,
  };
}

function parseRecord(value: unknown): ProfileSessionRecord {
  // Records are checked by the same validator the listening sync uses, so a file can never hold what the sync would refuse.
  const record = value as ProfileSessionRecord;
  try {
    validateProfileRecord(record, record.device.device_id);
  } catch {
    throw new Error('The profile contains a damaged listening record');
  }
  return record;
}

/** Reads the profile part of a manifest. Throws for anything that is not a valid TON profile; refused settings are reported. */
export function parseProfileBundle(value: unknown): ParsedProfileBundle {
  if (!isObject(value) || value.format !== PROFILE_BUNDLE_FORMAT) throw new Error('This is not a TON profile');
  if (value.version !== PROFILE_BUNDLE_VERSION) throw new Error('This profile was made by another version of TON');
  if (!Number.isSafeInteger(value.created_at) || typeof value.device_name !== 'string' || typeof value.platform !== 'string' || !PLATFORMS.includes(value.platform)) {
    throw new Error('The profile header is damaged');
  }
  if (!isObject(value.settings)) throw new Error('The profile settings are damaged');
  if (!Array.isArray(value.starred) || value.starred.length > MAX_STARRED || !value.starred.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256)) {
    throw new Error('The profile starred songs are damaged');
  }
  if (!Array.isArray(value.listening) || value.listening.length > MAX_LISTENING) throw new Error('The profile listening history is damaged');

  const stringSettings: Record<string, string | null> = {};
  for (const [key, setting] of Object.entries(value.settings)) stringSettings[key] = typeof setting === 'string' ? setting : null;
  const { kept, ignored } = portableSettings(stringSettings);

  return {
    bundle: {
      format: PROFILE_BUNDLE_FORMAT,
      version: PROFILE_BUNDLE_VERSION,
      created_at: Number(value.created_at),
      device_name: value.device_name.slice(0, 256),
      platform: value.platform as ProfileBundlePlatform,
      settings: kept,
      cloud: parseCloud(value.cloud),
      starred: value.starred.filter((id): id is string => typeof id === 'string'),
      listening: value.listening.map(parseRecord),
    },
    ignoredSettings: ignored,
  };
}
