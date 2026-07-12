import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import { shuffleArray, syncRntpQueue, syncUpcomingRntpQueue } from '../queue-sync';
import { syncRepeatMode } from '../player-runtime';

export async function toggleShuffle(): Promise<void> {
  const { shuffle } = usePlaybackStore.getState();
  const queue = useQueueStore.getState();
  const { items, currentIndex } = queue;

  if (items.length <= 1) {
    usePlaybackStore.setState({ shuffle: !shuffle });
    return;
  }

  if (!shuffle) {
    const originalOrder =
      queue.originalOrder.length === items.length ? [...queue.originalOrder] : [...items];
    const prefix = currentIndex >= 0 ? items.slice(0, currentIndex + 1) : [];
    const upcoming = currentIndex >= 0 ? items.slice(currentIndex + 1) : [...items];
    shuffleArray(upcoming);
    const shuffled = [...prefix, ...upcoming];

    useQueueStore.setState({
      items: shuffled,
      currentIndex,
      originalOrder,
    });
    usePlaybackStore.setState({ shuffle: true });
    await syncUpcomingRntpQueue(shuffled, currentIndex);
    return;
  }

  const currentItem = items[currentIndex];
  const restored =
    queue.originalOrder.length === items.length ? [...queue.originalOrder] : [...items];
  const prefixMatchesOriginal =
    currentIndex >= 0 &&
    items
      .slice(0, currentIndex + 1)
      .every((item, index) => restored[index]?.id === item.id);

  if (prefixMatchesOriginal) {
    useQueueStore.setState({
      items: restored,
      currentIndex,
      originalOrder: restored,
    });
    usePlaybackStore.setState({ shuffle: false });
    await syncUpcomingRntpQueue(restored, currentIndex);
    return;
  }

  const restoredIndex = currentItem
    ? restored.findIndex((item) => item.id === currentItem.id)
    : currentIndex;

  useQueueStore.setState({
    items: restored,
    currentIndex: restoredIndex >= 0 ? restoredIndex : 0,
    originalOrder: restored,
  });
  usePlaybackStore.setState({ shuffle: false });
  await syncRntpQueue(restored);
}

export async function toggleRepeat(): Promise<void> {
  const { repeat } = usePlaybackStore.getState();
  const next = repeat === 'all' ? 'one' : 'all';
  usePlaybackStore.setState({ repeat: next });
  await syncRepeatMode(next);
}
