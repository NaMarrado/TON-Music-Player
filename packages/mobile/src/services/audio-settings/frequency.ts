import { normalizeFrequencyHz } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
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
  await ensureAudioEffectsAttached();
}
