import type { QueueItem, QueueStatus } from '../services/download-queue';
import type { DownloadInput } from '../services/downloader';
import { getTrackIdsBySourceIdentity } from '../services/db-queries';
import { reconcileLibraryTracks, useLibraryStore } from './library-store';

export type DownloadQueueItem = QueueItem;

export type DownloadIdsByStatus = Record<QueueStatus, number[]>;

export const EMPTY_IDS_BY_STATUS = (): DownloadIdsByStatus => ({
  pending: [],
  downloading: [],
  retrying: [],
  completed: [],
  error: [],
});

export function normalizeItems(items: DownloadQueueItem[]) {
  const itemsById: Record<number, DownloadQueueItem> = {};
  const orderedIds: number[] = [];
  const idsByStatus = EMPTY_IDS_BY_STATUS();

  for (const item of items) {
    itemsById[item.id] = item;
    orderedIds.push(item.id);
    idsByStatus[item.status].push(item.id);
  }

  return { itemsById, orderedIds, idsByStatus };
}

export async function syncCompletedLibraryTracks(
  items: DownloadQueueItem[],
  previousItemsById: Record<number, DownloadQueueItem>,
): Promise<void> {
  if (!useLibraryStore.getState().hasLoaded) {
    return;
  }

  const trackIds = items
    .filter((item) => {
      if (item.status !== 'completed' || item.trackId == null) {
        return false;
      }

      const previousItem = previousItemsById[item.id];
      return previousItem?.trackId !== item.trackId || previousItem?.status !== 'completed';
    })
    .map((item) => item.trackId)
    .filter((trackId): trackId is number => trackId != null);

  if (trackIds.length === 0) {
    return;
  }

  await reconcileLibraryTracks().catch(() => {});
}

export async function getExistingLibraryTrackId(input: DownloadInput): Promise<number | null> {
  const matches = await getTrackIdsBySourceIdentity(input.source, [input.sourceId]);
  return matches[input.sourceId] ?? null;
}

export async function getExistingLibraryTrackIds(
  inputs: DownloadInput[],
): Promise<Record<string, number>> {
  const youtubeIds = [...new Set(inputs
    .filter((input) => input.source === 'youtube')
    .map((input) => input.sourceId))];
  const spotifyIds = [...new Set(inputs
    .filter((input) => input.source === 'spotify')
    .map((input) => input.sourceId))];

  const [youtubeMatches, spotifyMatches] = await Promise.all([
    getTrackIdsBySourceIdentity('youtube', youtubeIds),
    getTrackIdsBySourceIdentity('spotify', spotifyIds),
  ]);

  return {
    ...Object.fromEntries(
      Object.entries(youtubeMatches).map(([sourceId, trackId]) => [`youtube:${sourceId}`, trackId]),
    ),
    ...Object.fromEntries(
      Object.entries(spotifyMatches).map(([sourceId, trackId]) => [`spotify:${sourceId}`, trackId]),
    ),
  };
}
