import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import type {
  PlaybackRuntimeEventPayload,
  PlaybackRuntimeEventType,
  PlaybackRuntimeProgress,
  PlaybackRuntimeQueueOptions,
  PlaybackRuntimeStateSnapshot,
  PlaybackRuntimeTrack,
  PlaybackRuntimeUpdateOptions,
} from './types';

const DEFAULT_PLAYBACK_OPTIONS: PlaybackRuntimeUpdateOptions = {
  capabilities: [
    Capability.SkipToPrevious,
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
    Capability.PlayFromId,
    Capability.SeekTo,
  ],
  notificationCapabilities: [
    Capability.SkipToPrevious,
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
  ],
  compactCapabilities: [
    Capability.SkipToPrevious,
    Capability.Play,
    Capability.SkipToNext,
  ],
  android: {
    appKilledPlaybackBehavior:
      AppKilledPlaybackBehavior.ContinuePlayback,
  },
};

export async function setupPlaybackRuntimePlayer(): Promise<void> {
  await TrackPlayer.setupPlayer();
}

export async function configureDefaultPlaybackRuntimeOptions(): Promise<void> {
  await TrackPlayer.updateOptions(DEFAULT_PLAYBACK_OPTIONS);
}

export async function setPlaybackQueue(tracks: PlaybackRuntimeTrack[]): Promise<void> {
  await TrackPlayer.setQueue(tracks);
}

export async function replacePlaybackQueue(
  tracks: PlaybackRuntimeTrack[],
  options: PlaybackRuntimeQueueOptions,
): Promise<void> {
  await TrackPlayer.setQueue(tracks);
  if (!tracks.length) return;

  const startIndex = Math.max(0, Math.min(options.startIndex, tracks.length - 1));
  if (startIndex > 0) {
    await TrackPlayer.skip(startIndex);
  }
  if (options.autoplay) {
    await TrackPlayer.play();
  }
}

export async function addPlaybackTracks(tracks: PlaybackRuntimeTrack[]): Promise<void> {
  await TrackPlayer.add(tracks);
}

export async function loadPlaybackTrack(track: PlaybackRuntimeTrack): Promise<void> {
  await TrackPlayer.load(track);
}

export async function playPlayback(): Promise<void> {
  await TrackPlayer.play();
}

export async function pausePlayback(): Promise<void> {
  await TrackPlayer.pause();
}

export async function stopPlayback(): Promise<void> {
  await TrackPlayer.stop();
}

export async function seekPlayback(position: number): Promise<void> {
  await TrackPlayer.seekTo(position);
}

export async function setPlaybackVolume(volume: number): Promise<void> {
  await TrackPlayer.setVolume(volume);
}

export async function setPlaybackRepeatMode(mode: number): Promise<void> {
  await TrackPlayer.setRepeatMode(mode);
}

export async function setPlaybackShuffleEnabled(_enabled: boolean): Promise<void> {
  // RNTP exposes queue order rather than a separate shuffle-mode state.
}

export async function skipPlaybackIndex(index: number): Promise<void> {
  await TrackPlayer.skip(index);
}

export async function skipToNextPlayback(): Promise<void> {
  await TrackPlayer.skipToNext();
}

export async function skipToPreviousPlayback(): Promise<void> {
  await TrackPlayer.skipToPrevious();
}

export async function removeUpcomingPlaybackTracks(): Promise<void> {
  await TrackPlayer.removeUpcomingTracks();
}

export async function getPlaybackPosition(): Promise<number> {
  return TrackPlayer.getPosition();
}

export async function getPlaybackProgress(): Promise<PlaybackRuntimeProgress> {
  return TrackPlayer.getProgress();
}

export async function getPlaybackState(): Promise<PlaybackRuntimeStateSnapshot> {
  return TrackPlayer.getPlaybackState();
}

export async function getActivePlaybackTrack(): Promise<PlaybackRuntimeTrack | undefined> {
  return TrackPlayer.getActiveTrack();
}

export async function getActivePlaybackTrackIndex(): Promise<number | undefined> {
  return TrackPlayer.getActiveTrackIndex();
}

export function usePlaybackRuntimeProgress(updateInterval = 250): PlaybackRuntimeProgress {
  return useProgress(updateInterval);
}

export function usePlaybackRuntimeEvents<T extends PlaybackRuntimeEventType>(
  events: T[],
  listener: (event: PlaybackRuntimeEventPayload<T> & { type: T }) => void,
): void {
  useTrackPlayerEvents(events as never, listener as never);
}

export function addPlaybackRuntimeEventListener<T extends PlaybackRuntimeEventType>(
  event: T,
  listener: PlaybackRuntimeEventPayload<T> extends never
    ? () => void
    : (payload: PlaybackRuntimeEventPayload<T>) => void,
) {
  return TrackPlayer.addEventListener(event as never, listener as never);
}
