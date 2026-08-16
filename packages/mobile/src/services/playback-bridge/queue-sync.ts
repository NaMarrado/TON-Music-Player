import { PLAYBACK_QUEUE_WINDOW_SIZE } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getTrackById } from '../db-queries';
import {
  addPlaybackTracks,
  getPlaybackState,
  getPlaybackPosition,
  PlaybackStateValue,
  removePlaybackTracks,
  removeUpcomingPlaybackTracks,
  seekPlayback,
  replacePlaybackQueue,
  skipPlaybackIndex,
} from '../playback-runtime';
import { incrementPlayCount } from './player-runtime';
import { buildRntpQueue, type QueueTrackRef } from './track-mapping';

let latestSkipRequest = 0;

export async function skipToIndex(index: number, countPlay = false): Promise<void> {
  const {
    currentIndex: previousIndex,
    generation,
    items,
  } = useQueueStore.getState();
  if (index < 0 || index >= items.length) return;

  const request = ++latestSkipRequest;
  useQueueStore.setState({ currentIndex: index });

  try {
    await skipPlaybackIndex(index);
  } catch (error) {
    if (
      latestSkipRequest === request
      && useQueueStore.getState().generation === generation
    ) {
      useQueueStore.setState({ currentIndex: previousIndex });
    }
    throw error;
  }

  if (
    latestSkipRequest !== request
    || useQueueStore.getState().generation !== generation
    || useQueueStore.getState().currentIndex !== index
  ) {
    return;
  }

  const item = items[index];
  const nativeState = await getPlaybackState().catch(() => null);
  const isPlaying = nativeState != null && (
    nativeState.state === PlaybackStateValue.Playing
    || nativeState.state === PlaybackStateValue.Buffering
    || nativeState.state === PlaybackStateValue.Loading
  );
  if (item) {
    const track = await getTrackById(item.track_id);
    if (track) {
      usePlaybackStore.setState({
        currentTrack: track,
        isPlaying,
        position: 0,
        duration: (track.duration_ms ?? 0) / 1000,
      });
    }
  }

  if (countPlay) {
    if (item) {
      incrementPlayCount(item.track_id);
    }
  }
}

export async function syncRntpQueue(items: QueueTrackRef[]): Promise<void> {
  const sourceCount = useQueueStore.getState().originalOrder.length || items.length;
  const ordered = await buildRntpQueue(items, 0, sourceCount);
  const { currentIndex } = useQueueStore.getState();
  const wasPlaying = usePlaybackStore.getState().isPlaying;
  const prevPosition = await getPlaybackPosition().catch(() => 0);

  await replacePlaybackQueue(ordered, {
    autoplay: wasPlaying,
    startIndex: currentIndex,
  });
  if (currentIndex >= 0 && currentIndex < items.length) {
    if (prevPosition > 0) {
      await seekPlayback(prevPosition);
    }
  }
}

export async function syncUpcomingRntpQueue<T extends QueueTrackRef>(
  items: T[],
  currentIndex: number,
): Promise<T[]> {
  if (currentIndex < 0 || currentIndex >= items.length) {
    await syncRntpQueue(items);
    return items;
  }

  const boundedItems = items.slice(
    currentIndex,
    currentIndex + PLAYBACK_QUEUE_WINDOW_SIZE,
  );
  const upcoming = boundedItems.slice(1);
  const generation = useQueueStore.getState().generation;
  let orderedUpcoming: Awaited<ReturnType<typeof buildRntpQueue>> = [];
  if (upcoming.length) {
    const sourceCount = useQueueStore.getState().originalOrder.length || items.length;
    orderedUpcoming = await buildRntpQueue(upcoming, 1, sourceCount);
    if (orderedUpcoming.length !== upcoming.length) {
      throw new Error('playback-queue-hydration-incomplete');
    }
  }
  if (useQueueStore.getState().generation !== generation) return [];

  await removeUpcomingPlaybackTracks();
  if (orderedUpcoming.length) await addPlaybackTracks(orderedUpcoming);
  if (currentIndex > 0) {
    await removePlaybackTracks(Array.from({ length: currentIndex }, (_, index) => index));
  }
  return boundedItems;
}

export function shuffleArray<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
}
