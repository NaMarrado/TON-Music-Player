import { useEffect, useState } from 'react';
import type { PlaybackRuntimeEventPayload } from './types';
import type {
  PlaybackRuntimeEventType,
  PlaybackRuntimeProgress,
  PlaybackRuntimeStateSnapshot,
  PlaybackRuntimeTrack,
  PlaybackRuntimeUpdateOptions,
} from './types';
import {
  addIosPlaybackTracks,
  configureDefaultIosPlaybackRuntimeOptions,
  getActiveIosPlaybackTrack,
  getActiveIosPlaybackTrackIndex,
  getIosPlaybackPosition,
  getIosPlaybackProgress,
  getIosPlaybackState,
  loadIosPlaybackTrack,
  pauseIosPlayback,
  playIosPlayback,
  removeUpcomingIosPlaybackTracks,
  seekIosPlayback,
  setIosPlaybackQueue,
  setIosPlaybackRepeatMode,
  setIosPlaybackVolume,
  setupIosPlaybackRuntimePlayer,
  skipIosPlaybackIndex,
  skipToNextIosPlayback,
  skipToPreviousIosPlayback,
  stopIosPlayback,
  subscribeToIosPlaybackEvents,
} from './ios-native';

const IOS_PLAYBACK_CAPABILITY = {
  Pause: 3,
  Play: 0,
  SkipToNext: 7,
  SkipToPrevious: 8,
} as const;

const DEFAULT_PLAYBACK_OPTIONS: PlaybackRuntimeUpdateOptions = {
  capabilities: [
    IOS_PLAYBACK_CAPABILITY.SkipToPrevious,
    IOS_PLAYBACK_CAPABILITY.Play,
    IOS_PLAYBACK_CAPABILITY.Pause,
    IOS_PLAYBACK_CAPABILITY.SkipToNext,
  ],
  notificationCapabilities: [
    IOS_PLAYBACK_CAPABILITY.SkipToPrevious,
    IOS_PLAYBACK_CAPABILITY.Play,
    IOS_PLAYBACK_CAPABILITY.Pause,
    IOS_PLAYBACK_CAPABILITY.SkipToNext,
  ],
  compactCapabilities: [
    IOS_PLAYBACK_CAPABILITY.SkipToPrevious,
    IOS_PLAYBACK_CAPABILITY.Play,
    IOS_PLAYBACK_CAPABILITY.SkipToNext,
  ],
};

export async function setupPlaybackRuntimePlayer(): Promise<void> {
  await setupIosPlaybackRuntimePlayer();
}

export async function configureDefaultPlaybackRuntimeOptions(): Promise<void> {
  await configureDefaultIosPlaybackRuntimeOptions(DEFAULT_PLAYBACK_OPTIONS);
}

export async function setPlaybackQueue(tracks: PlaybackRuntimeTrack[]): Promise<void> {
  await setIosPlaybackQueue(tracks);
}

export async function addPlaybackTracks(tracks: PlaybackRuntimeTrack[]): Promise<void> {
  await addIosPlaybackTracks(tracks);
}

export async function loadPlaybackTrack(track: PlaybackRuntimeTrack): Promise<void> {
  await loadIosPlaybackTrack(track);
}

export async function playPlayback(): Promise<void> {
  await playIosPlayback();
}

export async function pausePlayback(): Promise<void> {
  await pauseIosPlayback();
}

export async function stopPlayback(): Promise<void> {
  await stopIosPlayback();
}

export async function seekPlayback(position: number): Promise<void> {
  await seekIosPlayback(position);
}

export async function setPlaybackVolume(volume: number): Promise<void> {
  await setIosPlaybackVolume(volume);
}

export async function setPlaybackRepeatMode(mode: number): Promise<void> {
  await setIosPlaybackRepeatMode(mode);
}

export async function skipPlaybackIndex(index: number): Promise<void> {
  await skipIosPlaybackIndex(index);
}

export async function skipToNextPlayback(): Promise<void> {
  await skipToNextIosPlayback();
}

export async function skipToPreviousPlayback(): Promise<void> {
  await skipToPreviousIosPlayback();
}

export async function removeUpcomingPlaybackTracks(): Promise<void> {
  await removeUpcomingIosPlaybackTracks();
}

export async function getPlaybackPosition(): Promise<number> {
  return getIosPlaybackPosition();
}

export async function getPlaybackProgress(): Promise<PlaybackRuntimeProgress> {
  return getIosPlaybackProgress();
}

export async function getPlaybackState(): Promise<PlaybackRuntimeStateSnapshot> {
  return (await getIosPlaybackState()) as unknown as PlaybackRuntimeStateSnapshot;
}

export async function getActivePlaybackTrack(): Promise<PlaybackRuntimeTrack | undefined> {
  return getActiveIosPlaybackTrack();
}

export async function getActivePlaybackTrackIndex(): Promise<number | undefined> {
  return getActiveIosPlaybackTrackIndex();
}

export function usePlaybackRuntimeProgress(updateInterval = 250): PlaybackRuntimeProgress {
  const [progress, setProgress] = useState<PlaybackRuntimeProgress>({
    position: 0,
    duration: 0,
    buffered: 0,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const sync = async (): Promise<void> => {
      try {
        const next = await getIosPlaybackProgress();
        if (!cancelled) {
          setProgress(next);
        }
      } catch {
        if (!cancelled) {
          setProgress((current) => current);
        }
      }
    };

    void sync();
    timer = setInterval(() => {
      void sync();
    }, updateInterval);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [updateInterval]);

  return progress;
}

export function usePlaybackRuntimeEvents<T extends PlaybackRuntimeEventType>(
  events: T[],
  listener: (event: PlaybackRuntimeEventPayload<T> & { type: T }) => void,
): void {
  useEffect(() => {
    const subscription = subscribeToIosPlaybackEvents((event) => {
      const type = event.type as T | undefined;
      if (!type || !events.includes(type)) {
        return;
      }

      listener(event as unknown as PlaybackRuntimeEventPayload<T> & { type: T });
    });

    return () => {
      subscription.remove();
    };
  }, [events, listener]);
}

export function addPlaybackRuntimeEventListener<T extends PlaybackRuntimeEventType>(
  event: T,
  listener: PlaybackRuntimeEventPayload<T> extends never
    ? () => void
    : (payload: PlaybackRuntimeEventPayload<T>) => void,
) {
  return subscribeToIosPlaybackEvents((payload) => {
    if (payload.type === event) {
      listener(payload as unknown as PlaybackRuntimeEventPayload<T>);
    }
  });
}
