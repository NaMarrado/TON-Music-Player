import { usePlaybackStore } from '../stores/playback-store';
import { useQueueStore } from '../stores/queue-store';
import { stopPlayback } from './playback-runtime';

export async function clearDeletedTracksFromPlayback(trackIds: Iterable<number>): Promise<void> {
  const trackIdSet = trackIds instanceof Set ? trackIds : new Set(trackIds);
  if (trackIdSet.size === 0) {
    return;
  }

  const playbackState = usePlaybackStore.getState();
  const shouldClearCurrentTrack = (
    playbackState.currentTrack != null
    && trackIdSet.has(playbackState.currentTrack.id)
  );

  const queueState = useQueueStore.getState();
  const currentQueueItem = queueState.items[queueState.currentIndex];
  const removedBeforeCurrent = queueState.items
    .slice(0, Math.max(queueState.currentIndex, 0))
    .filter((item) => trackIdSet.has(item.track_id))
    .length;
  const nextItems = queueState.items.filter((item) => !trackIdSet.has(item.track_id));
  const nextOriginalOrder = queueState.originalOrder.filter(
    (item) => !trackIdSet.has(item.track_id),
  );

  if (nextItems.length !== queueState.items.length) {
    const currentWasRemoved = currentQueueItem
      ? trackIdSet.has(currentQueueItem.track_id)
      : false;
    const nextCurrentIndex = resolveQueueIndexAfterTrackRemoval(
      queueState.currentIndex,
      nextItems.length,
      removedBeforeCurrent,
      currentWasRemoved,
    );

    useQueueStore.setState({
      items: nextItems,
      currentIndex: nextCurrentIndex,
      originalOrder: nextOriginalOrder,
      source: nextItems.length > 0 ? queueState.source : null,
    });
  }

  if (!shouldClearCurrentTrack) {
    return;
  }

  await stopPlayback().catch(() => {});
  usePlaybackStore.setState({
    currentTrack: null,
    duration: 0,
    isPlaying: false,
    position: 0,
  });
}

function resolveQueueIndexAfterTrackRemoval(
  currentIndex: number,
  itemCount: number,
  removedBeforeCurrent: number,
  currentWasRemoved: boolean,
): number {
  if (itemCount === 0 || currentIndex < 0) {
    return -1;
  }

  if (currentWasRemoved) {
    return Math.min(currentIndex, itemCount - 1);
  }

  return Math.max(0, currentIndex - removedBeforeCurrent);
}
