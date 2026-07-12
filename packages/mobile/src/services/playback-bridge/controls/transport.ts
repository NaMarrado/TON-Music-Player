import type { Track } from '@ton/core';
import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import { getTrackById } from '../../db-queries';
import { setupPlayer } from '../../audio-player';
import {
  getPlaybackState,
  loadPlaybackTrack,
  pausePlayback,
  playPlayback,
  PlaybackStateValue,
  seekPlayback,
  setPlaybackQueue,
  skipPlaybackIndex,
} from '../../playback-runtime';
import { incrementPlayCount, runFirstPlaySetup } from '../player-runtime';
import { trackToRntp } from '../track-mapping';
import { initializeVolumeBoost } from '../volume';

export async function playTracks(
  tracks: Track[],
  startIndex: number,
): Promise<void> {
  await setupPlayer();

  const items = tracks.map((track, index) => ({
    id: `${track.id}-${index}-${Date.now()}`,
    track_id: track.id,
    added_by: 'user' as const,
  }));

  useQueueStore.setState({
    items,
    currentIndex: startIndex,
    source: 'user',
    originalOrder: [...items],
  });

  await setPlaybackQueue(
    tracks.map((track, index) => trackToRntp(track, `${index}`)),
  );
  await skipPlaybackIndex(startIndex);
  await playPlayback();
  await initializeVolumeBoost().catch(() => {});

  const track = tracks[startIndex];
  if (track) {
    const hydratedTrack = await getTrackById(track.id).catch(() => null);
    usePlaybackStore.setState({
      currentTrack: hydratedTrack ?? track,
      isPlaying: true,
      position: 0,
      duration: ((hydratedTrack ?? track).duration_ms ?? 0) / 1000,
    });
    incrementPlayCount(track.id);
  }

  runFirstPlaySetup();
}

export async function playSingleTrack(track: Track): Promise<void> {
  await setupPlayer();

  const queueItem = {
    id: `${track.id}-single-${Date.now()}`,
    track_id: track.id,
    added_by: 'user' as const,
  };

  useQueueStore.setState({
    items: [queueItem],
    currentIndex: 0,
    source: 'user',
    originalOrder: [queueItem],
  });

  await loadPlaybackTrack(trackToRntp(track, '0'));
  await playPlayback();
  await initializeVolumeBoost().catch(() => {});
  const started = await ensurePlaybackStarted();

  const hydratedTrack = await getTrackById(track.id).catch(() => null);

  usePlaybackStore.setState({
    currentTrack: hydratedTrack ?? track,
    isPlaying: started,
    position: 0,
    duration: ((hydratedTrack ?? track).duration_ms ?? 0) / 1000,
  });

  if (!started) {
    throw new Error('single-track-playback-did-not-start');
  }

  incrementPlayCount(track.id);
  runFirstPlaySetup();
}

export async function resume(): Promise<void> {
  await setupPlayer();
  await playPlayback();
  await initializeVolumeBoost().catch(() => {});
  usePlaybackStore.setState({ isPlaying: true });
}

export async function pause(): Promise<void> {
  await pausePlayback();
  usePlaybackStore.setState({ isPlaying: false });
}

export async function toggle(): Promise<void> {
  const { isPlaying } = usePlaybackStore.getState();
  if (isPlaying) {
    await pause();
  } else {
    await resume();
  }
}

export async function seek(seconds: number): Promise<void> {
  const { duration } = usePlaybackStore.getState();
  const upper = duration > 0 ? duration : Infinity;
  const clamped = Math.max(0, Math.min(seconds, upper));
  await seekPlayback(clamped);
  usePlaybackStore.setState({ position: clamped });
}

async function ensurePlaybackStarted(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const playbackState = await getPlaybackState();
    if (
      playbackState.state === PlaybackStateValue.Playing
      || playbackState.state === PlaybackStateValue.Buffering
    ) {
      return true;
    }

    if (attempt === 0 && (
      playbackState.state === PlaybackStateValue.Ready
      || playbackState.state === PlaybackStateValue.Paused
      || playbackState.state === PlaybackStateValue.Loading
    )) {
      await playPlayback();
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }
  }

  return false;
}
