import {
  EQ_BAND_FREQUENCIES,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PRESETS,
} from '@ton/core';

export const CANONICAL_EQ_FREQUENCIES: number[] = [...EQ_BAND_FREQUENCIES];
export const CANONICAL_EQ_BAND_COUNT = CANONICAL_EQ_FREQUENCIES.length;
export const DEFAULT_EQ_BANDS: number[] = [...EQ_PRESETS.flat];

const PRESET_NAMES = Object.keys(EQ_PRESETS);

export function mapPresetToBands(
  canonicalBands: number[],
  deviceBandCount: number,
  deviceFreqs: number[],
): number[] {
  const result: number[] = [];
  const referenceBands = normalizeEqBands(canonicalBands);

  for (let i = 0; i < deviceBandCount; i++) {
    const freq = deviceFreqs[i];
    result.push(interpolateGain(freq, CANONICAL_EQ_FREQUENCIES, referenceBands));
  }

  return result;
}

export function normalizeEqGain(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, Math.round(value)));
}

export function normalizeEqBands(values: number[]): number[] {
  if (values.length !== CANONICAL_EQ_BAND_COUNT) {
    return [...DEFAULT_EQ_BANDS];
  }

  return values.map(normalizeEqGain);
}

export function hasCanonicalEqBandCount(values: number[]): boolean {
  return values.length === CANONICAL_EQ_BAND_COUNT;
}

export function areEqBandsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function inferEqPresetName(values: number[]): string | null {
  const normalized = normalizeEqBands(values);

  for (const presetName of PRESET_NAMES) {
    if (areEqBandsEqual(normalized, EQ_PRESETS[presetName])) {
      return presetName;
    }
  }

  return null;
}

export function getEqFrequencyLabel(freq: number): string {
  if (freq >= 1000) {
    return freq % 1000 === 0
      ? `${freq / 1000}K`
      : `${(freq / 1000).toFixed(1)}K`;
  }

  return `${freq}`;
}

export function dbToMillibels(
  db: number,
  range: { min: number; max: number },
): number {
  const mb = normalizeEqGain(db) * 100;
  return Math.max(range.min, Math.min(range.max, Math.round(mb)));
}

function interpolateGain(
  freq: number,
  refFreqs: number[],
  refGains: number[],
): number {
  if (freq <= refFreqs[0]) return refGains[0];
  if (freq >= refFreqs[refFreqs.length - 1]) return refGains[refGains.length - 1];

  for (let i = 0; i < refFreqs.length - 1; i++) {
    if (freq >= refFreqs[i] && freq <= refFreqs[i + 1]) {
      const logFreq = Math.log10(freq);
      const logLow = Math.log10(refFreqs[i]);
      const logHigh = Math.log10(refFreqs[i + 1]);
      const t = (logFreq - logLow) / (logHigh - logLow);
      return refGains[i] + t * (refGains[i + 1] - refGains[i]);
    }
  }

  return 0;
}
