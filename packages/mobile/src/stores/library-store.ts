import { create } from 'zustand';
import type { Track, SortField, SortOrder } from '@ton/core';
import { getFilteredTracks } from '@ton/core';
import { getAllTracks, getTrackById } from '../services/db-queries';
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
}

export const useLibraryStore = create<LibraryState>()(() => ({
  tracks: [],
  sortBy: 'added_at',
  sortOrder: 'desc',
  filterQuery: '',
  isLoading: false,
  hasLoaded: false,
}));

let loadTracksPromise: Promise<void> | null = null;

export async function loadTracks(): Promise<void> {
  if (loadTracksPromise) {
    return loadTracksPromise;
  }

  useLibraryStore.setState({ isLoading: true });
  loadTracksPromise = (async () => {
    try {
      const tracks = await getAllTracks();
      useLibraryStore.setState({ tracks, isLoading: false, hasLoaded: true });
    } catch {
      useLibraryStore.setState({ isLoading: false });
      throw new Error('library-load-failed');
    } finally {
      loadTracksPromise = null;
    }
  })();

  return loadTracksPromise;
}

export function upsertTrack(track: Track): void {
  const state = useLibraryStore.getState();
  if (!state.hasLoaded) {
    return;
  }

  const nextTracks = state.tracks.filter((currentTrack) => currentTrack.id !== track.id);
  nextTracks.unshift(track);
  useLibraryStore.setState({ tracks: nextTracks });
}

export async function upsertTrackById(trackId: number): Promise<void> {
  const track = await getTrackById(trackId);
  if (!track || track.in_library !== 1) {
    return;
  }

  upsertTrack(track);
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
  const { tracks } = useLibraryStore.getState();
  useLibraryStore.setState({
    tracks: tracks.map((t) =>
      t.id === trackId
        ? { ...t, play_count: t.play_count + 1, last_played_at: Math.floor(Date.now() / 1000) }
        : t,
    ),
  });
}

export async function deleteTracksEverywhere(trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) {
    return;
  }

  const uniqueTrackIds = Array.from(new Set(trackIds));
  const trackIdSet = new Set(uniqueTrackIds);
  const prevTracks = useLibraryStore.getState().tracks;
  useLibraryStore.setState({
    tracks: prevTracks.filter((track) => !trackIdSet.has(track.id)),
  });

  try {
    await deleteTrackRowsEverywhere(uniqueTrackIds);
    await clearDeletedTracksFromPlayback(trackIdSet);
  } catch (error) {
    useLibraryStore.setState({ tracks: prevTracks });
    throw error;
  }
}
