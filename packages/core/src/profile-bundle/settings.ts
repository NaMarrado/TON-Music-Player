import { SUPPORTED_LANGUAGES } from '../i18n/languages';

const isBoolean = (value: string): boolean => value === 'true' || value === 'false';
const inRange = (low: number, high: number) => (value: string): boolean => {
  if (value.trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= low && number <= high;
};
const isKey = (value: string): boolean => value.length <= 512 && !/[\r\n]/.test(value);
const isEqBands = (value: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === 10 && parsed.every((band) => typeof band === 'number' && Number.isFinite(band) && band >= -30 && band <= 30);
  } catch {
    return false;
  }
};

/**
 * The settings a profile file carries and restores, keys included. Each key has a validator, so a hand-edited file cannot
 * store nonsense. Not listed, and so never carried: folders, the device's own ids and running state, which belong to one
 * device. The R2 connection travels separately (see ProfileBundle.cloud) because its secret is stored encrypted.
 */
export const PROFILE_SETTING_VALIDATORS: Record<string, (value: string) => boolean> = {
  language: (value) => (SUPPORTED_LANGUAGES as readonly string[]).includes(value),
  loudness_normalization: isBoolean,
  loudness_target: inRange(-60, 0),
  eq_enabled: isBoolean,
  eq_preset: (value) => value.length > 0 && value.length <= 40,
  eq_bands: isEqBands,
  frequency_enabled: isBoolean,
  frequency_hz: inRange(20, 20000),
  download_quality_profile: (value) => value === 'normal' || value === 'best_compatible',
  volume_percent: inRange(0, 1000),
  spotify_client_id: isKey,
  spotify_client_secret: isKey,
  cloud_auto_sync_enabled: isBoolean,
  sync_audio_over_cellular: isBoolean,
  concurrent_downloads: inRange(1, 16),
  studio_tab_enabled: isBoolean,
};

export const PROFILE_SETTING_KEYS: Record<string, true> = Object.fromEntries(Object.keys(PROFILE_SETTING_VALIDATORS).map((key) => [key, true]));
