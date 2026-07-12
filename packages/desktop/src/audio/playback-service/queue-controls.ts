import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getActiveElement } from '../media-element-pool';
import { updateMediaSessionPosition } from './position';
import { shuffleArray } from './queue-helpers';
import { loadQueueIndex } from './track-loading';

export async function nextTrack(auto = false): Promise<void> {
  const { items, currentIndex } = useQueueStore.getState();
  const { repeat, shuffle } = usePlaybackStore.getState();

  if (items.length === 0) {
    return;
  }

  if (auto && repeat === 'one') {
    await loadQueueIndex(currentIndex);
    return;
  }

  let nextIndex: number;
  if (currentIndex < items.length - 1) {
    nextIndex = currentIndex + 1;
  } else {
    if (shuffle && items.length > 1) {
      const rest = [...items];
      shuffleArray(rest);
      useQueueStore.setState({ items: rest, currentIndex: 0 });
      await loadQueueIndex(0);
      return;
    }

    nextIndex = 0;
  }

  await loadQueueIndex(nextIndex);
}

export async function prevTrack(): Promise<void> {
  const element = getActiveElement();
  if (element.currentTime > 3) {
    element.currentTime = 0;
    usePlaybackStore.setState({ position: 0 });
    updateMediaSessionPosition();
    return;
  }

  const { items, currentIndex } = useQueueStore.getState();
  if (items.length === 0) {
    return;
  }

  const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
  await loadQueueIndex(prevIndex);
}

export function toggleShuffle(): void {
  const { shuffle } = usePlaybackStore.getState();
  const queue = useQueueStore.getState();

  if (!shuffle) {
    const current = queue.items[queue.currentIndex];
    const rest = queue.items.filter((_, index) => index !== queue.currentIndex);
    shuffleArray(rest);
    const shuffled = current ? [current, ...rest] : rest;

    useQueueStore.setState({
      items: shuffled,
      currentIndex: 0,
      originalOrder: [...queue.items],
    });
    usePlaybackStore.setState({ shuffle: true });
    return;
  }

  const currentItem = queue.items[queue.currentIndex];
  const restored = queue.originalOrder;
  const restoredIndex = currentItem
    ? restored.findIndex((item) => item.id === currentItem.id)
    : 0;

  useQueueStore.setState({
    items: restored,
    currentIndex: restoredIndex >= 0 ? restoredIndex : 0,
  });
  usePlaybackStore.setState({ shuffle: false });
}

export function toggleRepeat(): void {
  const { repeat } = usePlaybackStore.getState();
  usePlaybackStore.setState({ repeat: repeat === 'all' ? 'one' : 'all' });
}

export async function jumpToQueueIndex(index: number): Promise<void> {
  await loadQueueIndex(index);
}
