import { usePlaybackRuntimeProgress } from '../services/playback-runtime';

export function useTrackProgress(updateInterval = 250) {
  return usePlaybackRuntimeProgress(updateInterval);
}
