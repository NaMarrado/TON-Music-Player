import {
  getFilteredPlaylistTracks,
  getFilteredTracks,
  type PlaybackQueueSourceDescriptor,
  type PlaylistTrackEntry,
  type QueueItem,
  type SortField,
  type Track,
  rebuildRollingQueueUpcoming,
} from '@ton/core';
import { useLibraryStore } from '../../stores/library-store';
import { usePlaybackStore } from '../../stores/playback-store';
import { usePlaylistStore } from '../../stores/playlist-store';
import { useQueueStore } from '../../stores/queue-store';
import { syncUpcomingRntpQueue } from './queue-sync';
import { hydrateMobileQueueItems } from './track-mapping';

let reconcilePromise: Promise<void> | null = null;
let reconcileRequested = false;

export function schedulePlaybackQueueSourceReconcile(): void {
  reconcileRequested = true;
  if (reconcilePromise) return;

  reconcilePromise = (async () => {
    while (reconcileRequested) {
      reconcileRequested = false;
      await reconcilePlaybackQueueSource();
    }
  })().catch(() => {}).finally(() => {
    reconcilePromise = null;
    if (reconcileRequested) schedulePlaybackQueueSourceReconcile();
  });
}

export async function reconcilePlaybackQueueSource(): Promise<void> {
  const queue = useQueueStore.getState();
  const descriptor = queue.sourceDescriptor;
  if (!descriptor || !isDynamicSource(descriptor)) return;

  const sourceTracks = getSourceTracks(descriptor);
  if (!sourceTracks || sourceTracks.length === 0 || queue.items.length === 0) return;

  const nextOriginalOrder = reconcileOriginalItems(
    queue.originalOrder,
    sourceTracks,
    queue.generation,
    descriptor.kind === 'playlist',
  );
  if (sameQueueIdentity(queue.originalOrder, nextOriginalOrder)) return;

  const currentItem = queue.items[queue.currentIndex];
  if (!currentItem) return;
  const sourceIndexByIdentity = new Map(
    nextOriginalOrder.map((item, index) => [queueIdentity(item), index]),
  );
  const remappedItems = queue.items.flatMap((item) => {
    const sourceIndex = sourceIndexByIdentity.get(queueIdentity(item));
    return sourceIndex == null ? [] : [{ ...item, source_index: sourceIndex }];
  });
  const currentIndex = remappedItems.findIndex((item) => item.id === currentItem.id);
  if (currentIndex < 0) return;
  const plan = rebuildRollingQueueUpcoming(
    remappedItems.slice(0, currentIndex + 1),
    nextOriginalOrder,
    currentIndex,
    queue.generation,
    usePlaybackStore.getState().shuffle,
    queue.nextQueueSerial,
  );
  const hydratedItems = await hydrateMobileQueueItems(plan.items);
  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: plan.currentIndex,
    originalOrder: nextOriginalOrder,
    nextQueueSerial: plan.nextSerial,
  });
  await syncUpcomingRntpQueue(hydratedItems, plan.currentIndex);
}

function getSourceTracks(descriptor: PlaybackQueueSourceDescriptor): Track[] | null {
  const libraryTracks = useLibraryStore.getState().tracks;
  switch (descriptor.kind) {
    case 'library':
      return getFilteredTracks(
        libraryTracks,
        descriptor.filter_query ?? '',
        (descriptor.sort_by ?? 'added_at') as SortField,
        descriptor.sort_order ?? 'desc',
      );
    case 'playlist': {
      const playlistId = Number(descriptor.source_id);
      const detail = usePlaylistStore.getState().playlistDetails[playlistId];
      return detail?.hasLoaded ? getFilteredPlaylistTracks(
        detail.tracks,
        descriptor.filter_query ?? '',
        (descriptor.sort_by ?? null) as import('@ton/core').PlaylistSortField,
        descriptor.sort_order ?? 'asc',
      ) : null;
    }
    case 'artist':
      return libraryTracks.filter((track) => track.artist === descriptor.source_id);
    case 'album': {
      const [artist, album] = String(descriptor.source_id ?? '').split('\u0000');
      return libraryTracks
        .filter((track) => track.album === album && (!artist || track.artist === artist))
        .sort((left, right) => (left.track_number ?? 0) - (right.track_number ?? 0));
    }
    default:
      return null;
  }
}

function reconcileOriginalItems(
  current: QueueItem[],
  tracks: Track[],
  generation: number,
  playlistSource: boolean,
): QueueItem[] {
  const available = new Map<string, QueueItem[]>();
  current.forEach((item) => {
    const key = sourceTrackIdentity(item, playlistSource);
    const values = available.get(key) ?? [];
    values.push(item);
    available.set(key, values);
  });

  return tracks.map((track, index) => {
    const playlistTrackId = getPlaylistTrackId(track);
    const key = playlistSource && playlistTrackId != null
      ? `p:${playlistTrackId}`
      : `t:${track.id}`;
    const existing = available.get(key)?.shift();
    return existing ?? {
      id: `${track.id}-g${generation}-r${index}-${playlistTrackId ?? 'track'}`,
      track_id: track.id,
      playlist_track_id: playlistTrackId ?? undefined,
      added_by: 'user',
    };
  });
}

function getPlaylistTrackId(track: Track): number | null {
  const candidate = (track as Partial<PlaylistTrackEntry>).playlist_track_id;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function sourceTrackIdentity(item: QueueItem, playlistSource: boolean): string {
  return playlistSource && item.playlist_track_id != null
    ? `p:${item.playlist_track_id}`
    : `t:${item.track_id}`;
}

function queueIdentity(item: QueueItem): string {
  return item.playlist_track_id != null
    ? `p:${item.playlist_track_id}`
    : `t:${item.track_id}`;
}

function sameQueueIdentity(left: QueueItem[], right: QueueItem[]): boolean {
  return left.length === right.length
    && left.every((item, index) => sourceTrackIdentity(item, item.playlist_track_id != null)
      === sourceTrackIdentity(right[index], right[index].playlist_track_id != null));
}

function isDynamicSource(descriptor: PlaybackQueueSourceDescriptor): boolean {
  return descriptor.kind === 'album'
    || descriptor.kind === 'artist'
    || descriptor.kind === 'library'
    || descriptor.kind === 'playlist';
}
