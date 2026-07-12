/**
 * Playback EQ / Frequency / Loudness - audio processing controls.
 *
 * Extracted from playback-service.ts. These functions are 100% independent —
 * they only communicate with engine.ts and usePlaybackStore.
 */

import {
  EQ_PRESETS,
  PITCH_REFERENCE_FREQUENCY_HZ,
  normalizeFrequencyHz,
  resolveStoredFrequencyHz,
} from '@ton/core';
import { usePlaybackStore } from '../stores/playback-store';
import {
  setEqBandGain as engineSetEqBand,
  setAllEqBands as engineSetAllEqBands,
  enablePitchShifter,
  disablePitchShifter,
  setLoudnessGain,
} from './engine';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;

// ── Restore persisted EQ/frequency/loudness settings ──

export async function restoreAudioSettings(): Promise<void> {
  try {
    const [eqEnabledStr, eqBandsStr, eqPresetStr, freqStr, loudnessStr] = await Promise.all([
      ipc('settings:get', 'eq_enabled') as Promise<string | null>,
      ipc('settings:get', 'eq_bands') as Promise<string | null>,
      ipc('settings:get', 'eq_preset') as Promise<string | null>,
      ipc('settings:get', 'frequency_hz') as Promise<string | null>,
      ipc('settings:get', 'loudness_normalization') as Promise<string | null>,
    ]);

    const eqEnabled = eqEnabledStr === 'true';
    const eqPreset = eqPresetStr || 'flat';
    let eqBands: number[];
    try {
      eqBands = eqBandsStr ? JSON.parse(eqBandsStr) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    } catch {
      eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    usePlaybackStore.setState({ eqEnabled, eqBands, eqPreset });

    if (eqEnabled) {
      engineSetAllEqBands(eqBands);
    }

    const { frequencyHz, shouldPersist } = resolveStoredFrequencyHz(freqStr);
    usePlaybackStore.setState({ frequencyHz });
    if (frequencyHz !== PITCH_REFERENCE_FREQUENCY_HZ) {
      enablePitchShifter(frequencyHz / PITCH_REFERENCE_FREQUENCY_HZ);
    }
    if (shouldPersist) {
      ipc('settings:set', 'frequency_hz', String(frequencyHz));
    }

    const loudnessNormEnabled = loudnessStr === 'true';
    usePlaybackStore.setState({ loudnessNormEnabled });
  } catch {
    // Settings load failure is non-critical
  }
}

// ── Equalizer ──

export function setEqBand(index: number, gain: number): void {
  const { eqEnabled, eqBands } = usePlaybackStore.getState();
  const newBands = [...eqBands];
  newBands[index] = gain;
  usePlaybackStore.setState({ eqBands: newBands, eqPreset: 'custom' });

  if (eqEnabled) {
    engineSetEqBand(index, gain);
  }

  ipc('settings:set', 'eq_bands', JSON.stringify(newBands));
  ipc('settings:set', 'eq_preset', 'custom');
}

export function setEqPreset(presetName: string): void {
  const gains = EQ_PRESETS[presetName];
  if (!gains) return;

  const { eqEnabled } = usePlaybackStore.getState();
  usePlaybackStore.setState({ eqBands: [...gains], eqPreset: presetName });

  if (eqEnabled) {
    engineSetAllEqBands(gains);
  }

  ipc('settings:set', 'eq_bands', JSON.stringify(gains));
  ipc('settings:set', 'eq_preset', presetName);
}

export function toggleEq(): void {
  const { eqEnabled, eqBands } = usePlaybackStore.getState();
  const newEnabled = !eqEnabled;
  usePlaybackStore.setState({ eqEnabled: newEnabled });

  if (newEnabled) {
    engineSetAllEqBands(eqBands);
  } else {
    engineSetAllEqBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  }

  ipc('settings:set', 'eq_enabled', String(newEnabled));
}

// ── Frequency / Pitch ──

export function setFrequency(hz: number): void {
  const frequencyHz = normalizeFrequencyHz(hz);
  usePlaybackStore.setState({ frequencyHz });

  if (frequencyHz === PITCH_REFERENCE_FREQUENCY_HZ) {
    disablePitchShifter();
  } else {
    enablePitchShifter(frequencyHz / PITCH_REFERENCE_FREQUENCY_HZ);
  }

  ipc('settings:set', 'frequency_hz', String(frequencyHz));
}

// ── Loudness toggle ──

export function toggleLoudnessNorm(): void {
  const { loudnessNormEnabled, currentTrack } = usePlaybackStore.getState();
  const newEnabled = !loudnessNormEnabled;
  usePlaybackStore.setState({ loudnessNormEnabled: newEnabled });

  // Apply or remove loudness gain for current track
  if (newEnabled && currentTrack?.loudness_gain != null) {
    setLoudnessGain(currentTrack.loudness_gain);
  } else {
    setLoudnessGain(0);
  }

  ipc('settings:set', 'loudness_normalization', String(newEnabled));
}
