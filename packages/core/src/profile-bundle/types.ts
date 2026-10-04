import type { ExportPlaylistEntry } from '../types/export';
import type { ProfileSessionRecord } from '../services/listening-profile/records';

export const PROFILE_BUNDLE_FORMAT = 'ton-profile';
export const PROFILE_BUNDLE_VERSION = 1;

export type ProfileBundlePlatform = 'desktop' | 'android' | 'ios';

/**
 * Everything "the profile" means, in one portable file: the app settings that make sense on another device, the starred
 * songs, the playlists, and the listening history. Audio files are not part of it, and neither is anything secret.
 * Songs are referred to by the same hash identities the library export uses, so any device can match them.
 */
export interface ProfileBundle {
  format: typeof PROFILE_BUNDLE_FORMAT;
  version: typeof PROFILE_BUNDLE_VERSION;
  created_at: number;
  device_name: string;
  platform: ProfileBundlePlatform;
  settings: Record<string, string>;
  /** Song identities (`sha256:<hash>` or `file:<hash>`) of the starred songs, sorted and unique. */
  starred: string[];
  playlists: ExportPlaylistEntry[];
  listening: ProfileSessionRecord[];
}

/** What an exporting device hands over. `settings` is the raw settings table: secrets in it are filtered out. */
export interface ProfileBundleInput {
  deviceName: string;
  platform: ProfileBundlePlatform;
  settings: Record<string, string | null | undefined>;
  starred: string[];
  playlists: ExportPlaylistEntry[];
  listening: ProfileSessionRecord[];
}

export interface ParsedProfileBundle {
  bundle: ProfileBundle;
  /** Settings keys in the file that were not applied: secret, unknown or holding an invalid value. */
  ignoredSettings: string[];
}
