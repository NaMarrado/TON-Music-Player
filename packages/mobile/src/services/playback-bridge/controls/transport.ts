import type { PlaybackQueueSourceDescriptor, QueueItem, Track } from '@ton/core';
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
  replacePlaybackQueue,
} from '../../playback-runtime';
import { incrementPlayCount, runFirstPlaySetup } from '../player-runtime';
import { trackToRntp } from '../track-mapping';
import { initializeVolumeBoost } from '../volume';

export async function playTracks(
  tracks: Track[],
  startIndex: number,
  sourceDescriptor: PlaybackQueueSourceDescriptor = { kind: 'custom' },
): Promise<void> {
  if (tracks.length === 0 || startIndex < 0 || startIndex >= tracks.length) {
    return;
  }

  const previousGeneration = useQueueStore.getState().generation;
  const generation = previousGeneration + 1;
  const originalItems: QueueItem[] = tracks.map((track, index) => ({
    id: `${track.id}-g${generation}-i${index}`,
    track_id: track.id,
    added_by: 'user' as const,
    playlist_track_id: 'playlist_track_id' in track
      ? Number(track.playlist_track_id)
      : undefined,
  }));
  const trackByItemId = new Map(originalItems.map((item, index) => [item.id, tracks[index]]));
  const shuffleEnabled = usePlaybackStore.getState().shuffle;
  let items = [...originalItems];
  let currentIndex = startIndex;

  if (shuffleEnabled && items.length > 1) {
    const selected = items[startIndex];
    const remaining = items.filter((_, index) => index !== startIndex);
    shuffleQueueItems(remaining);
    items = [selected, ...remaining];
    currentIndex = 0;
  }

  const selectedTrack = trackByItemId.get(items[currentIndex]?.id ?? '') ?? tracks[startIndex];

  useQueueStore.setState({
    items,
    currentIndex,
    source: 'user',
    sourceDescriptor,
    originalOrder: originalItems,
    generation,
  });
  usePlaybackStore.setState({
    currentTrack: selectedTrack,
    isPlaying: true,
    position: 0,
    duration: (selectedTrack.duration_ms ?? 0) / 1000,
  });

  try {
    await setupPlayer();
    await replacePlaybackQueue(
      items.map((item) => trackToRntp(trackByItemId.get(item.id)!, item.id)),
      { autoplay: true, startIndex: currentIndex },
    );
    if (useQueueStore.getState().generation !== generation) return;
    await initializeVolumeBoost().catch(() => {});

    const hydratedTrack = await getTrackById(selectedTrack.id).catch(() => null);
    if (useQueueStore.getState().generation !== generation) return;
    usePlaybackStore.setState({
      currentTrack: hydratedTrack ?? selectedTrack,
      isPlaying: true,
      position: 0,
      duration: ((hydratedTrack ?? selectedTrack).duration_ms ?? 0) / 1000,
    });
    incrementPlayCount(selectedTrack.id);
    runFirstPlaySetup();
  } catch (error) {
    if (useQueueStore.getState().generation === generation) {
      usePlaybackStore.setState({ isPlaying: false });
    }
    throw error;
  }
}

export async function playSingleTrack(track: Track): Promise<void> {
  await setupPlayer();

  const generation = useQueueStore.getState().generation + 1;

  const queueItem = {
    id: `${track.id}-g${generation}-single`,
    track_id: track.id,
    added_by: 'user' as const,
  };

  useQueueStore.setState({
    items: [queueItem],
    currentIndex: 0,
    source: 'user',
    sourceDescriptor: { kind: 'single', source_id: track.id },
    originalOrder: [queueItem],
    generation,
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
  usePlaybackStore.setState({ position: clamped });
  await seekPlayback(clamped);
}

function shuffleQueueItems<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
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
