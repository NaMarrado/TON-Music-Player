import { SUPPORTED_LANGUAGES } from '../i18n/languages';

const isBoolean = (value: string): boolean => value === 'true' || value === 'false';
const inRange = (low: number, high: number) => (value: string): boolean => {
  if (value.trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= low && number <= high;
};
const isEqBands = (value: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === 10 && parsed.every((band) => typeof band === 'number' && Number.isFinite(band) && band >= -30 && band <= 30);
  } catch {
    return false;
  }
};

/**
 * The only settings a profile file may carry or restore. A key is listed here because it is a plain preference that means
 * the same on every device. Nothing that identifies a device, points at a folder, holds a credential or describes a running
 * session is allowed, and a test enforces that. Each key has a validator, so a hand-edited file cannot store nonsense.
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
};

export const PROFILE_SETTING_KEYS: Record<string, true> = Object.fromEntries(Object.keys(PROFILE_SETTING_VALIDATORS).map((key) => [key, true]));
