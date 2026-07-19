import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import {
  getPlaybackProgress,
  seekPlayback,
} from '../../playback-runtime';
import { skipToIndex } from '../queue-sync';
import { advanceRollingQueueWindow } from './rolling';

export async function nextTrack(): Promise<void> {
  const { items, currentIndex } = useQueueStore.getState();
  const { repeat } = usePlaybackStore.getState();

  if (items.length === 0) return;

  if (currentIndex < items.length - 1) {
    await skipToIndex(currentIndex + 1);
    return;
  }

  if (repeat === 'all' && await advanceRollingQueueWindow()) {
    return;
  }

  await skipToIndex(0);
}

export async function prevTrack(): Promise<void> {
  const progress = await getPlaybackProgress();
  if (progress.position > 3) {
    await seekPlayback(0);
    return;
  }

  const { items, currentIndex } = useQueueStore.getState();
  if (items.length === 0) return;

  if (currentIndex > 0) {
    await skipToIndex(currentIndex - 1);
    return;
  }

  const { repeat } = usePlaybackStore.getState();
  if (repeat === 'all') {
    await skipToIndex(items.length - 1);
  } else {
    await seekPlayback(0);
  }
}

export async function jumpToQueueIndex(index: number): Promise<void> {
  await skipToIndex(index);
}
