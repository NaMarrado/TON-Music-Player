import { normalizeFrequencyHz } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { setPitch } from '../native-pitch';
import { supportsPitchAdjustment } from './capabilities';
import { ensureAudioEffectsAttached } from './equalizer';
import { persistAudioSetting } from './persistence';

export async function setFrequency(hz: number): Promise<void> {
  if (!supportsPitchAdjustment()) {
    return;
  }

  const frequencyHz = normalizeFrequencyHz(hz);
  usePlaybackStore.setState({ frequencyHz });
  persistAudioSetting('frequency_hz', String(frequencyHz));

  if (usePlaybackStore.getState().frequencyEnabled) {
    await ensureAudioEffectsAttached();
  }
}

export async function setFrequencyEnabled(enabled: boolean): Promise<void> {
  if (!supportsPitchAdjustment()) {
    return;
  }

  usePlaybackStore.setState({ frequencyEnabled: enabled });
  persistAudioSetting('frequency_enabled', String(enabled));

  if (!enabled) {
    try {
      await setPitch(1);
    } catch {
      // The neutral ratio will be applied when the next audio session attaches.
    }
    return;
  }

  await ensureAudioEffectsAttached();
}
