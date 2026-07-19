import { getEffectiveFrequencyPitchRatio } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { setPitch } from '../native-pitch';
import { restoreVolumePercent } from '../playback-bridge/volume';
import { readStoredAudioSettings } from './persistence';
import { persistAudioSetting } from './persistence';
import { logVolumeDebug } from '../volume-debug';
import { setNativeLoudnessNormalizationEnabled } from '../native-audio-boost';

export async function restoreAudioSettings(): Promise<void> {
  const settings = await readStoredAudioSettings();
  const {
    didMigrateFrequencyHz,
    didNormalizeEqState,
    eqBands,
    eqEnabled,
    eqPreset,
    frequencyEnabled,
    frequencyHz,
    loudnessNormEnabled,
    shouldPersistFrequencyEnabled,
    shouldPersistVolumePercent,
    volumePercent,
  } = settings;
  logVolumeDebug('restore:resolved', {
    volumePercent,
    shouldPersistVolumePercent,
  });

  usePlaybackStore.setState({
    eqBands,
    eqEnabled,
    eqPreset,
    frequencyEnabled,
    frequencyHz,
    loudnessNormEnabled,
    volumePercent,
  });

  try {
    await setNativeLoudnessNormalizationEnabled(loudnessNormEnabled);
    await restoreVolumePercent(volumePercent);
  } catch {
    // Volume will be applied when a track plays.
  }

  if (shouldPersistVolumePercent) {
    persistAudioSetting('volume_percent', String(volumePercent));
  }

  if (didMigrateFrequencyHz) {
    persistAudioSetting('frequency_hz', String(frequencyHz));
  }

  if (shouldPersistFrequencyEnabled) {
    persistAudioSetting('frequency_enabled', String(frequencyEnabled));
  }

  if (didNormalizeEqState) {
    persistAudioSetting('eq_bands', JSON.stringify(eqBands));
    persistAudioSetting('eq_preset', eqPreset);
  }

  try {
    await setPitch(getEffectiveFrequencyPitchRatio(frequencyHz, frequencyEnabled));
  } catch {
    // Pitch not available until first track plays.
  }

  usePlaybackStore.setState({
    eqBands,
    eqEnabled,
    eqPreset,
    frequencyEnabled,
    frequencyHz,
    loudnessNormEnabled,
    volumePercent,
  });
}
