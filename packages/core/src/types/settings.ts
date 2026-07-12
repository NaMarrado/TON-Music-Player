import {
  DEFAULT_FREQUENCY_HZ,
  EQ_PRESETS,
  LUFS_TARGET_DEFAULT,
} from './audio';
import { DEFAULT_VOLUME_PERCENT } from '../utils/volume-law';

export interface SettingsMap {
  language: string;
  /** Legacy raw volume value used only as a migration source. */
  volume: number;
  volume_percent: number;
  loudness_normalization: boolean;
  loudness_target: number;
  eq_enabled: boolean;
  eq_preset: string;
  eq_bands: string;
  frequency_hz: number;
  download_quality_profile: DownloadQualityProfile;
  download_directory: string;
  concurrent_downloads: number;
  library_directories: string;
  spotify_client_id: string;
  spotify_client_secret: string;
  cloud_r2_config: string;
  cloud_r2_device_id: string;
  cloud_r2_last_revision: string;
  schema_version: string;
}

export type DownloadQualityProfile = 'normal' | 'best_compatible';

export type SettingKey = keyof SettingsMap;

export const SETTING_DEFAULTS: SettingsMap = {
  language: 'en',
  volume: 1,
  volume_percent: DEFAULT_VOLUME_PERCENT,
  loudness_normalization: false,
  loudness_target: LUFS_TARGET_DEFAULT,
  eq_enabled: false,
  eq_preset: 'flat',
  eq_bands: JSON.stringify(EQ_PRESETS.flat),
  frequency_hz: DEFAULT_FREQUENCY_HZ,
  download_quality_profile: 'normal',
  download_directory: '',
  concurrent_downloads: 4,
  library_directories: '[]',
  spotify_client_id: '',
  spotify_client_secret: '',
  cloud_r2_config: '',
  cloud_r2_device_id: '',
  cloud_r2_last_revision: '',
  schema_version: '1',
};

export const PERSISTED_SETTING_DEFAULTS = {
  language: 'en',
  volume_percent: DEFAULT_VOLUME_PERCENT,
  loudness_normalization: false,
  loudness_target: LUFS_TARGET_DEFAULT,
  eq_enabled: false,
  eq_preset: 'flat',
  eq_bands: JSON.stringify(EQ_PRESETS.flat),
  frequency_hz: DEFAULT_FREQUENCY_HZ,
  download_quality_profile: 'normal',
  download_directory: '',
  concurrent_downloads: 4,
  library_directories: '[]',
  spotify_client_id: '',
  spotify_client_secret: '',
  cloud_r2_config: '',
  cloud_r2_device_id: '',
  cloud_r2_last_revision: '',
  schema_version: '1',
} satisfies Omit<SettingsMap, 'volume'>;
