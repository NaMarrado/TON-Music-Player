import { create } from 'zustand';
import type { Track, SortField, SortOrder } from '@ton/core';
import { getFilteredTracks } from '@ton/core';
import { getAllTracks, getTracksByIds } from '../services/db-queries';
import {
  deleteTracksEverywhere as deleteTrackRowsEverywhere,
} from '../services/track-removal';
import { clearDeletedTracksFromPlayback } from '../services/playback-deletion-cleanup';

interface LibraryState {
  tracks: Track[];
  sortBy: SortField;
  sortOrder: SortOrder;
  filterQuery: string;
  isLoading: boolean;
  hasLoaded: boolean;
  revision: number;
}

export const useLibraryStore = create<LibraryState>()(() => ({
  tracks: [],
  sortBy: 'added_at',
  sortOrder: 'desc',
  filterQuery: '',
  isLoading: false,
  hasLoaded: false,
  revision: 0,
}));

let loadTracksPromise: Promise<void> | null = null;
const LIBRARY_RECONCILE_DELAY_MS = 100;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileWaiters: Array<{
  reject: (error: unknown) => void;
  resolve: () => void;
}> = [];

export async function loadTracks(): Promise<void> {
  if (loadTracksPromise) {
    return loadTracksPromise;
  }

  useLibraryStore.setState({ isLoading: true });
  loadTracksPromise = (async () => {
    try {
      while (true) {
        const revision = useLibraryStore.getState().revision;
        const tracks = await getAllTracks();
        let committed = false;

        useLibraryStore.setState((state) => {
          if (state.revision !== revision) {
            return state;
          }

          committed = true;
          return { tracks, isLoading: false, hasLoaded: true };
        });

        if (committed) {
          break;
        }
      }
    } catch {
      useLibraryStore.setState({ isLoading: false });
      throw new Error('library-load-failed');
    } finally {
      loadTracksPromise = null;
    }
  })();

  return loadTracksPromise;
}

async function flushLibraryReconcile(): Promise<void> {
  if (reconcileTimer) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }

  const waiters = reconcileWaiters;
  reconcileWaiters = [];
  try {
    await loadTracks();
    waiters.forEach(({ resolve }) => resolve());
  } catch (error) {
    waiters.forEach(({ reject }) => reject(error));
    throw error;
  }
}

function scheduleLibraryReconcile(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    reconcileWaiters.push({ reject, resolve });
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
    }
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      void flushLibraryReconcile().catch(() => {});
    }, LIBRARY_RECONCILE_DELAY_MS);
  });
}

export async function reconcileLibraryTracks(
  options: { immediate?: boolean; loadIfUninitialized?: boolean } = {},
): Promise<void> {
  useLibraryStore.setState((state) => ({ revision: state.revision + 1 }));
  const { immediate = false, loadIfUninitialized = false } = options;
  if (!loadIfUninitialized && !useLibraryStore.getState().hasLoaded && !loadTracksPromise) {
    return;
  }

  if (immediate) {
    await flushLibraryReconcile();
    return;
  }

  await scheduleLibraryReconcile();
}

export function upsertTrack(track: Track): void {
  upsertTracks([track]);
}

export function upsertTracks(tracks: Track[]): void {
  if (tracks.length === 0) {
    return;
  }

  useLibraryStore.setState((state) => {
    if (!state.hasLoaded) {
      return { revision: state.revision + 1 };
    }

    const incomingIds = new Set(tracks.map((track) => track.id));
    const nextTracks = [
      ...tracks,
      ...state.tracks.filter((currentTrack) => !incomingIds.has(currentTrack.id)),
    ];
    return { tracks: nextTracks, revision: state.revision + 1 };
  });
}

export async function upsertTrackById(trackId: number): Promise<void> {
  await upsertTracksByIds([trackId]);
}

export async function upsertTracksByIds(trackIds: number[]): Promise<void> {
  const uniqueTrackIds = [...new Set(trackIds)];
  if (uniqueTrackIds.length === 0) {
    return;
  }

  const tracks = await getTracksByIds(uniqueTrackIds);
  upsertTracks(tracks);
}

export function setSortBy(sortBy: SortField): void {
  const { sortBy: current, sortOrder } = useLibraryStore.getState();
  if (current === sortBy) {
    useLibraryStore.setState({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
  } else {
    useLibraryStore.setState({ sortBy, sortOrder: 'asc' });
  }
}

export function setFilterQuery(query: string): void {
  useLibraryStore.setState({ filterQuery: query });
}

export function getDisplayTracks(): Track[] {
  const { tracks, filterQuery, sortBy, sortOrder } = useLibraryStore.getState();
  return getFilteredTracks(tracks, filterQuery, sortBy, sortOrder);
}

export function markTrackPlayed(trackId: number): void {
  useLibraryStore.setState((state) => ({
    tracks: state.tracks.map((t) =>
      t.id === trackId
        ? { ...t, play_count: t.play_count + 1, last_played_at: Math.floor(Date.now() / 1000) }
        : t,
    ),
    revision: state.revision + 1,
  }));
}

export async function deleteTracksEverywhere(trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) {
    return;
  }

  const uniqueTrackIds = Array.from(new Set(trackIds));
  const trackIdSet = new Set(uniqueTrackIds);
  const prevTracks = useLibraryStore.getState().tracks;
  useLibraryStore.setState((state) => ({
    tracks: state.tracks.filter((track) => !trackIdSet.has(track.id)),
    revision: state.revision + 1,
  }));

  try {
    await deleteTrackRowsEverywhere(uniqueTrackIds);
    await clearDeletedTracksFromPlayback(trackIdSet);
  } catch (error) {
    useLibraryStore.setState((state) => ({
      tracks: prevTracks,
      revision: state.revision + 1,
    }));
    throw error;
  }
}
