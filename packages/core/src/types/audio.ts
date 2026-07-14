export type EQFilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass';

export interface EQBand {
  frequency: number;
  gain: number;
  q: number;
  type: EQFilterType;
}

export interface FrequencyPreset {
  name: string;
  hz: number;
}

export interface LoudnessData {
  lufs: number;
  gain: number;
}

export const EQ_BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const PITCH_REFERENCE_FREQUENCY_HZ = 440;
export const DEFAULT_FREQUENCY_HZ = 432;
export const MIN_FREQUENCY_HZ = 400;
export const MAX_FREQUENCY_HZ = 600;

export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  { name: '432hz', hz: DEFAULT_FREQUENCY_HZ },
  { name: '440hz', hz: PITCH_REFERENCE_FREQUENCY_HZ },
  { name: '444hz', hz: 444 },
  { name: '528hz', hz: 528 },
];

export const LUFS_TARGET_DEFAULT = -14;

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_boost: [5, 4, 3, 1, 0, 0, 0, 0, 0, 0],
  treble_boost: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
  vocal: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  rock: [4, 3, 1, 0, -1, 0, 1, 3, 4, 4],
  electronic: [4, 3, 1, 0, -2, 0, 1, 2, 4, 4],
  acoustic: [3, 2, 1, 0, 1, 1, 2, 2, 3, 2],
};

export type ResolvedStoredFrequencyHz = {
  frequencyHz: number;
  shouldPersist: boolean;
};

export type ResolvedStoredFrequencyEnabled = {
  frequencyEnabled: boolean;
  shouldPersist: boolean;
};

export function normalizeFrequencyHz(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_FREQUENCY_HZ;
  }

  return Math.max(
    MIN_FREQUENCY_HZ,
    Math.min(MAX_FREQUENCY_HZ, Math.round(value)),
  );
}

export function resolveStoredFrequencyHz(
  value: string | number | null | undefined,
): ResolvedStoredFrequencyHz {
  if (value == null) {
    return { frequencyHz: DEFAULT_FREQUENCY_HZ, shouldPersist: true };
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  const frequencyHz = normalizeFrequencyHz(parsed);

  return {
    frequencyHz,
    shouldPersist: !Number.isFinite(parsed) || frequencyHz !== parsed,
  };
}

export function resolveStoredFrequencyEnabled(
  value: string | boolean | number | null | undefined,
): ResolvedStoredFrequencyEnabled {
  const frequencyEnabled = value === true || value === 'true';
  return {
    frequencyEnabled,
    shouldPersist: value == null || String(value) !== String(frequencyEnabled),
  };
}

export function getEffectiveFrequencyPitchRatio(
  frequencyHz: number,
  enabled: boolean,
): number {
  if (!enabled) return 1;
  return normalizeFrequencyHz(frequencyHz) / PITCH_REFERENCE_FREQUENCY_HZ;
}
