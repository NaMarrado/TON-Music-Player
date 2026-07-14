import { EQ_PRESETS, getEffectiveFrequencyPitchRatio } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { supportsEqualizerEffects, supportsPitchAdjustment } from './capabilities';
import { getAudioSessionId, setPitch } from '../native-pitch';
import {
  attachEqualizer,
  setEqBandLevel,
  setEqEnabled,
} from '../native-equalizer';
import {
  dbToMillibels,
  mapPresetToBands,
  normalizeEqGain,
} from './math';
import { persistAudioSetting } from './persistence';
import {
  getAttachedAudioSessionId,
  getAudioEffectsStatus,
  getEqInfo,
  setAttachedAudioSessionId,
  setAudioEffectsStatus,
  setEqRuntimeInfo,
  type AudioEffectsStatus,
} from './state';

export async function initializeEqualizer(): Promise<void> {
  await ensureAudioEffectsAttached();
}

export async function ensureAudioEffectsAttached(): Promise<AudioEffectsStatus> {
  if (!supportsEqualizerEffects() && !supportsPitchAdjustment()) {
    setAudioEffectsStatus('unsupported');
    return getAudioEffectsStatus();
  }

  let sessionId = 0;

  try {
    sessionId = await getAudioSessionId();
  } catch {
    setAudioEffectsStatus('deferred');
    return getAudioEffectsStatus();
  }

  if (sessionId === 0) {
    setAudioEffectsStatus('deferred');
    return getAudioEffectsStatus();
  }

  await ensureEqualizerAttachedForSession(sessionId);
  await applyCurrentAudioEffects();
  return getAudioEffectsStatus();
}

async function ensureEqualizerAttachedForSession(sessionId: number): Promise<void> {
  if (
    getEqInfo()
    && getAttachedAudioSessionId() === sessionId
    && getAudioEffectsStatus() === 'attached'
  ) {
    return;
  }

  if (getAudioEffectsStatus() === 'unsupported') {
    return;
  }

  try {
    const eqInfo = await attachEqualizer(sessionId);
    setEqRuntimeInfo(eqInfo);
    setAttachedAudioSessionId(sessionId);
    setAudioEffectsStatus('attached');
  } catch {
    setEqRuntimeInfo(null);
    setAttachedAudioSessionId(0);
    setAudioEffectsStatus('unsupported');
  }
}

export async function setEqBand(index: number, gainDb: number): Promise<void> {
  if (!supportsEqualizerEffects()) {
    return;
  }

  const { eqBands } = usePlaybackStore.getState();
  const nextBands = [...eqBands];
  nextBands[index] = normalizeEqGain(gainDb);

  usePlaybackStore.setState({ eqBands: nextBands, eqPreset: 'custom' });
  persistAudioSetting('eq_bands', JSON.stringify(nextBands));
  persistAudioSetting('eq_preset', 'custom');
  await ensureAudioEffectsAttached();
}

export async function setEqPresetByName(presetName: string): Promise<void> {
  if (!supportsEqualizerEffects()) {
    return;
  }

  const presetBands = EQ_PRESETS[presetName];
  if (!presetBands) return;

  const nextBands = [...presetBands];
  usePlaybackStore.setState({ eqBands: nextBands, eqPreset: presetName });
  persistAudioSetting('eq_bands', JSON.stringify(nextBands));
  persistAudioSetting('eq_preset', presetName);
  await ensureAudioEffectsAttached();
}

export async function toggleEq(): Promise<void> {
  if (!supportsEqualizerEffects()) {
    return;
  }

  const { eqEnabled } = usePlaybackStore.getState();
  const nextEnabled = !eqEnabled;

  usePlaybackStore.setState({ eqEnabled: nextEnabled });
  persistAudioSetting('eq_enabled', String(nextEnabled));
  await ensureAudioEffectsAttached();
}

async function applyCurrentAudioEffects(): Promise<void> {
  const { frequencyEnabled, frequencyHz } = usePlaybackStore.getState();

  try {
    await setPitch(getEffectiveFrequencyPitchRatio(frequencyHz, frequencyEnabled));
  } catch {
    // Pitch can lag behind until the player is fully ready.
  }

  await applyCurrentEqualizerState();
}

async function applyCurrentEqualizerState(): Promise<void> {
  const eqInfo = getEqInfo();
  if (!eqInfo) {
    return;
  }

  const { eqBands, eqEnabled } = usePlaybackStore.getState();
  const mappedBands = mapPresetToBands(
    eqBands,
    eqInfo.bandCount,
    eqInfo.frequencies,
  );

  try {
    await setEqEnabled(eqEnabled);

    for (let index = 0; index < mappedBands.length; index += 1) {
      await setEqBandLevel(
        index,
        dbToMillibels(mappedBands[index], eqInfo.levelRange),
      );
    }
  } catch {
    setEqRuntimeInfo(null);
    setAttachedAudioSessionId(0);
    setAudioEffectsStatus('unsupported');
  }
}
