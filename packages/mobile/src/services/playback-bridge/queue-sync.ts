import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getTrackById } from '../db-queries';
import {
  addPlaybackTracks,
  getPlaybackPosition,
  playPlayback,
  removeUpcomingPlaybackTracks,
  seekPlayback,
  setPlaybackQueue,
  skipPlaybackIndex,
} from '../playback-runtime';
import { incrementPlayCount } from './player-runtime';
import { buildRntpQueue, type QueueTrackRef } from './track-mapping';

export async function skipToIndex(index: number, countPlay = false): Promise<void> {
  const { items } = useQueueStore.getState();
  if (index < 0 || index >= items.length) return;

  useQueueStore.setState({ currentIndex: index });
  await skipPlaybackIndex(index);
  await playPlayback();

  const item = items[index];
  if (item) {
    const track = await getTrackById(item.track_id);
    if (track) {
      usePlaybackStore.setState({
        currentTrack: track,
        isPlaying: true,
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
  const ordered = await buildRntpQueue(items);
  const { currentIndex } = useQueueStore.getState();
  const wasPlaying = usePlaybackStore.getState().isPlaying;
  const prevPosition = await getPlaybackPosition().catch(() => 0);

  await setPlaybackQueue(ordered);
  if (currentIndex >= 0 && currentIndex < ordered.length) {
    await skipPlaybackIndex(currentIndex);
    if (prevPosition > 0) {
      await seekPlayback(prevPosition);
    }
    if (wasPlaying) {
      await playPlayback();
    }
  }
}

export async function syncUpcomingRntpQueue(
  items: QueueTrackRef[],
  currentIndex: number,
): Promise<void> {
  if (currentIndex < 0 || currentIndex >= items.length) {
    await syncRntpQueue(items);
    return;
  }

  const upcoming = items.slice(currentIndex + 1);
  await removeUpcomingPlaybackTracks();
  if (!upcoming.length) return;

  const orderedUpcoming = await buildRntpQueue(upcoming, currentIndex + 1);
  if (orderedUpcoming.length) {
    await addPlaybackTracks(orderedUpcoming);
  }
}

export function shuffleArray<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
}
