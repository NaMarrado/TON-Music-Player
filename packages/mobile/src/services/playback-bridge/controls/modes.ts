import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import { syncUpcomingRntpQueue } from '../queue-sync';
import { syncRepeatMode } from '../player-runtime';
import { setPlaybackShuffleEnabled } from '../../playback-runtime';
import { rebuildRollingQueueUpcoming, type RepeatMode } from '@ton/core';
import { hydrateMobileQueueItems } from '../track-mapping';

export async function toggleShuffle(): Promise<void> {
  const { shuffle } = usePlaybackStore.getState();
  const queue = useQueueStore.getState();
  const { items, currentIndex } = queue;

  if (queue.originalOrder.length <= 1) {
    const enabled = !shuffle;
    usePlaybackStore.setState({ shuffle: enabled });
    await setPlaybackShuffleEnabled(enabled);
    return;
  }

  const nextShuffle = !shuffle;
  const plan = rebuildRollingQueueUpcoming(
    items,
    queue.originalOrder,
    currentIndex,
    queue.generation,
    nextShuffle,
    queue.nextQueueSerial,
  );

  const hydratedItems = await hydrateMobileQueueItems(plan.items);
  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: plan.currentIndex,
    nextQueueSerial: plan.nextSerial,
  });
  usePlaybackStore.setState({ shuffle: nextShuffle });
  await syncUpcomingRntpQueue(hydratedItems, plan.currentIndex);
  await setPlaybackShuffleEnabled(nextShuffle);
}

export async function setShuffleEnabled(enabled: boolean): Promise<void> {
  if (usePlaybackStore.getState().shuffle === enabled) {
    await setPlaybackShuffleEnabled(enabled);
    return;
  }
  await toggleShuffle();
}

export async function toggleRepeat(): Promise<void> {
  const { repeat } = usePlaybackStore.getState();
  const next = repeat === 'all' ? 'one' : 'all';
  await setRepeatMode(next);
}

export async function setRepeatMode(mode: RepeatMode): Promise<void> {
  usePlaybackStore.setState({ repeat: mode });
  await syncRepeatMode(mode);
}
