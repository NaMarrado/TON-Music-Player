import {
  EQ_PRESETS,
  resolveStoredFrequencyEnabled,
  resolveStoredFrequencyHz,
  resolveStoredVolumePercent,
} from '@ton/core';
import { getSetting, setSetting } from '../db-queries';
import {
  areEqBandsEqual,
  CANONICAL_EQ_BAND_COUNT,
  DEFAULT_EQ_BANDS,
  hasCanonicalEqBandCount,
  inferEqPresetName,
  normalizeEqBands,
} from './math';

export interface StoredAudioSettings {
  didMigrateFrequencyHz: boolean;
  didNormalizeEqState: boolean;
  eqBands: number[];
  eqEnabled: boolean;
  eqPreset: string;
  frequencyEnabled: boolean;
  frequencyHz: number;
  loudnessNormEnabled: boolean;
  shouldPersistFrequencyEnabled: boolean;
  shouldPersistVolumePercent: boolean;
  volumePercent: number;
}

function parseEqBands(value: string | null): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.map((band) => Number(band));
  } catch {
    return null;
  }
}

function resolveEqState(
  eqBandsValue: string | null,
  eqPresetValue: string | null,
): {
  didNormalizeEqState: boolean;
  eqBands: number[];
  eqPreset: string;
} {
  const parsedBands = parseEqBands(eqBandsValue);
  const requestedPreset = eqPresetValue === 'custom'
    ? 'custom'
    : (eqPresetValue && EQ_PRESETS[eqPresetValue] ? eqPresetValue : null);

  if (parsedBands && hasCanonicalEqBandCount(parsedBands)) {
    const normalizedBands = normalizeEqBands(parsedBands);
    let resolvedPreset = 'custom';

    if (requestedPreset === 'custom') {
      resolvedPreset = 'custom';
    } else if (requestedPreset && areEqBandsEqual(normalizedBands, EQ_PRESETS[requestedPreset])) {
      resolvedPreset = requestedPreset;
    } else {
      resolvedPreset = inferEqPresetName(normalizedBands) ?? 'custom';
    }

    return {
      didNormalizeEqState:
        !areEqBandsEqual(parsedBands, normalizedBands)
        || eqPresetValue !== resolvedPreset,
      eqBands: normalizedBands,
      eqPreset: resolvedPreset,
    };
  }

  const fallbackPreset = requestedPreset && requestedPreset !== 'custom'
    ? requestedPreset
    : 'flat';
  const fallbackBands = [...(EQ_PRESETS[fallbackPreset] ?? DEFAULT_EQ_BANDS)];

  return {
    didNormalizeEqState:
      parsedBands == null
      || eqPresetValue !== fallbackPreset
      || (parsedBands != null && parsedBands.length !== CANONICAL_EQ_BAND_COUNT),
    eqBands: fallbackBands,
    eqPreset: fallbackPreset,
  };
}

export async function readStoredAudioSettings(): Promise<StoredAudioSettings> {
  const [
    volumePercentStr,
    volumeStr,
    frequencyEnabledStr,
    freqStr,
    eqEnabledStr,
    eqBandsStr,
    eqPresetStr,
    loudnessNormStr,
  ] =
    await Promise.all([
      getSetting('volume_percent'),
      getSetting('volume'),
      getSetting('frequency_enabled'),
      getSetting('frequency_hz'),
      getSetting('eq_enabled'),
      getSetting('eq_bands'),
      getSetting('eq_preset'),
      getSetting('loudness_normalization'),
    ]);

  const resolvedVolume = resolveStoredVolumePercent(volumePercentStr, volumeStr);
  const resolvedFrequencyEnabled = resolveStoredFrequencyEnabled(frequencyEnabledStr);
  const resolvedFrequency = resolveStoredFrequencyHz(freqStr);
  const {
    didNormalizeEqState,
    eqBands,
    eqPreset,
  } = resolveEqState(eqBandsStr, eqPresetStr);

  return {
    didMigrateFrequencyHz: resolvedFrequency.shouldPersist,
    didNormalizeEqState,
    eqBands,
    eqEnabled: eqEnabledStr === 'true',
    eqPreset,
    frequencyEnabled: resolvedFrequencyEnabled.frequencyEnabled,
    frequencyHz: resolvedFrequency.frequencyHz,
    loudnessNormEnabled: loudnessNormStr === 'true',
    shouldPersistFrequencyEnabled: resolvedFrequencyEnabled.shouldPersist,
    shouldPersistVolumePercent: resolvedVolume.shouldPersist,
    volumePercent: resolvedVolume.volumePercent,
  };
}

export function persistAudioSetting(key: string, value: string): void {
  setSetting(key, value).catch(() => {});
}
