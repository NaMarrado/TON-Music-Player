import { setSetting } from '../db-queries';
import { usePlaybackStore } from '../../stores/playback-store';
import { syncVolumeOutputToState } from '../playback-bridge/volume';

export async function setLoudnessNormalizationEnabled(enabled: boolean): Promise<void> {
  usePlaybackStore.setState({ loudnessNormEnabled: enabled });
  await syncVolumeOutputToState();
  setSetting('loudness_normalization', String(enabled)).catch(() => {});
}

export async function toggleLoudnessNormalization(): Promise<void> {
  const { loudnessNormEnabled } = usePlaybackStore.getState();
  await setLoudnessNormalizationEnabled(!loudnessNormEnabled);
}
