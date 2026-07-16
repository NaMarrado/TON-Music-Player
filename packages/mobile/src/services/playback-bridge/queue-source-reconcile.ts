import {
  getFilteredPlaylistTracks,
  getFilteredTracks,
  type PlaybackQueueSourceDescriptor,
  type PlaylistTrackEntry,
  type QueueItem,
  type SortField,
  type Track,
} from '@ton/core';
import { useLibraryStore } from '../../stores/library-store';
import { usePlaybackStore } from '../../stores/playback-store';
import { usePlaylistStore } from '../../stores/playlist-store';
import { useQueueStore } from '../../stores/queue-store';
import { syncRntpQueue, syncUpcomingRntpQueue } from './queue-sync';

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
  const shuffleEnabled = usePlaybackStore.getState().shuffle;

  if (shuffleEnabled) {
    const nextIdentity = new Set(nextOriginalOrder.map(queueIdentity));
    const prefix = queue.items
      .slice(0, queue.currentIndex + 1)
      .filter((item) => nextIdentity.has(queueIdentity(item)));
    const upcoming = queue.items
      .slice(queue.currentIndex + 1)
      .filter((item) => nextIdentity.has(queueIdentity(item)));
    const existingIdentity = new Set([...prefix, ...upcoming].map(queueIdentity));
    const additions = nextOriginalOrder.filter((item) => !existingIdentity.has(queueIdentity(item)));

    for (const item of additions) {
      const index = Math.floor(Math.random() * (upcoming.length + 1));
      upcoming.splice(index, 0, item);
    }

    const items = [...prefix, ...upcoming];
    const currentIndex = items.findIndex((item) => item.id === currentItem.id);
    if (currentIndex < 0) return;
    useQueueStore.setState({ items, currentIndex, originalOrder: nextOriginalOrder });
    await syncUpcomingRntpQueue(items, currentIndex);
    return;
  }

  const currentIdentity = queueIdentity(currentItem);
  const currentIndex = nextOriginalOrder.findIndex((item) => queueIdentity(item) === currentIdentity);
  if (currentIndex < 0) return;
  useQueueStore.setState({
    items: nextOriginalOrder,
    currentIndex,
    originalOrder: nextOriginalOrder,
  });
  await syncRntpQueue(nextOriginalOrder);
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
    : `i:${item.id}`;
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
