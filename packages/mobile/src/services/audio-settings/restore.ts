import { PITCH_REFERENCE_FREQUENCY_HZ } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { setPitch } from '../native-pitch';
import { restoreVolumePercent } from '../playback-bridge/volume';
import { readStoredAudioSettings } from './persistence';
import { persistAudioSetting } from './persistence';
import { logVolumeDebug } from '../volume-debug';

export async function restoreAudioSettings(): Promise<void> {
  const settings = await readStoredAudioSettings();
  const {
    didMigrateFrequencyHz,
    didNormalizeEqState,
    eqBands,
    eqEnabled,
    eqPreset,
    frequencyHz,
    loudnessNormEnabled,
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
    frequencyHz,
    loudnessNormEnabled,
    volumePercent,
  });

  try {
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

  if (didNormalizeEqState) {
    persistAudioSetting('eq_bands', JSON.stringify(eqBands));
    persistAudioSetting('eq_preset', eqPreset);
  }

  if (frequencyHz !== PITCH_REFERENCE_FREQUENCY_HZ) {
    try {
      await setPitch(frequencyHz / PITCH_REFERENCE_FREQUENCY_HZ);
    } catch {
      // Pitch not available until first track plays.
    }
  }

  usePlaybackStore.setState({
    eqBands,
    eqEnabled,
    eqPreset,
    frequencyHz,
    loudnessNormEnabled,
    volumePercent,
  });
}
