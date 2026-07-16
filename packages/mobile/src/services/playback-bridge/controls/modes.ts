import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import { syncRntpQueue, syncUpcomingRntpQueue } from '../queue-sync';
import { syncRepeatMode } from '../player-runtime';
import { disableQueueShuffle, enableQueueShuffle } from '../queue-plan';

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
    const plan = enableQueueShuffle(items, currentIndex);

    useQueueStore.setState({
      items: plan.items,
      currentIndex: plan.currentIndex,
      originalOrder,
    });
    usePlaybackStore.setState({ shuffle: true });
    await syncUpcomingRntpQueue(plan.items, plan.currentIndex);
    return;
  }

  const plan = disableQueueShuffle(items, queue.originalOrder, currentIndex);

  useQueueStore.setState({
    items: plan.items,
    currentIndex: plan.currentIndex,
    originalOrder: plan.items,
  });
  usePlaybackStore.setState({ shuffle: false });
  if (plan.requiresFullReplacement) {
    await syncRntpQueue(plan.items);
  } else {
    await syncUpcomingRntpQueue(plan.items, plan.currentIndex);
  }
}

export async function toggleRepeat(): Promise<void> {
  const { repeat } = usePlaybackStore.getState();
  const next = repeat === 'all' ? 'one' : 'all';
  usePlaybackStore.setState({ repeat: next });
  await syncRepeatMode(next);
}
