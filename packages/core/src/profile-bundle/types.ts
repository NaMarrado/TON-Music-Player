import type { ProfileSessionRecord } from '../services/listening-profile/records';
import type { CloudStorageConfig } from '../types/cloud-sync';

export const PROFILE_BUNDLE_FORMAT = 'ton-profile';
export const PROFILE_BUNDLE_VERSION = 2;

export type ProfileBundlePlatform = 'desktop' | 'android' | 'ios';

/**
 * The profile part of a Profile export: settings including keys, the R2 connection with its secret, the starred songs and
 * the listening history. It travels inside the export manifest next to the songs and playlists. Only what belongs to one
 * device (folders, the device's own ids, running state) stays behind, because it would break the other device.
 * Songs are referred to by the same hash identities the library export uses, so any device can match them.
 */
export interface ProfileBundle {
  format: typeof PROFILE_BUNDLE_FORMAT;
  version: typeof PROFILE_BUNDLE_VERSION;
  created_at: number;
  device_name: string;
  platform: ProfileBundlePlatform;
  settings: Record<string, string>;
  cloud: CloudStorageConfig | null;
  /** Song identities (`sha256:<hash>` or `file:<hash>`) of the starred songs, sorted and unique. */
  starred: string[];
  listening: ProfileSessionRecord[];
}

/** What an exporting device hands over. `settings` is the raw settings table: device-bound keys are filtered out. */
export interface ProfileBundleInput {
  deviceName: string;
  platform: ProfileBundlePlatform;
  settings: Record<string, string | null | undefined>;
  cloud: CloudStorageConfig | null;
  starred: string[];
  listening: ProfileSessionRecord[];
}

export interface ParsedProfileBundle {
  bundle: ProfileBundle;
  /** Settings keys in the file that were not applied: device-bound, unknown or holding an invalid value. */
  ignoredSettings: string[];
}
