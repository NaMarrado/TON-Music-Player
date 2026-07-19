import { setSetting } from '../db-queries';
import { usePlaybackStore } from '../../stores/playback-store';
import { syncVolumeOutputToState } from '../playback-bridge/volume';
import { setNativeLoudnessNormalizationEnabled } from '../native-audio-boost';

export async function setLoudnessNormalizationEnabled(enabled: boolean): Promise<void> {
  usePlaybackStore.setState({ loudnessNormEnabled: enabled });
  await setNativeLoudnessNormalizationEnabled(enabled);
  await syncVolumeOutputToState();
  setSetting('loudness_normalization', String(enabled)).catch(() => {});
}

export async function toggleLoudnessNormalization(): Promise<void> {
  const { loudnessNormEnabled } = usePlaybackStore.getState();
  await setLoudnessNormalizationEnabled(!loudnessNormEnabled);
}
