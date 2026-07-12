import { create } from 'zustand';
import type { Track } from '@ton/core';
import type { SortField } from '@ton/core';

export type LibraryTrack = Track & { playlist_names: string | null };
export type LibraryDeleteMode = 'library-only' | 'everywhere';

export { getFilteredTracks, getArtists, getMostPlayed, getRecentlyPlayed } from '@ton/core';
export type { SortField } from '@ton/core';

type ViewMode = 'grid' | 'list';

interface LibraryState {
  tracks: LibraryTrack[];
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  filterQuery: string;
  viewMode: ViewMode;
  isLoading: boolean;
  hasLoaded: boolean;
  isStale: boolean;
}

export const useLibraryStore = create<LibraryState>()(() => ({
  tracks: [],
  sortBy: 'added_at',
  sortOrder: 'desc',
  filterQuery: '',
  viewMode: 'list',
  isLoading: false,
  hasLoaded: false,
  isStale: false,
}));

/** Load all tracks from DB into the store (with playlist names). */
let loadTracksPromise: Promise<void> | null = null;

export async function loadTracks(options: { force?: boolean } = {}): Promise<void> {
  const { force = false } = options;
  const state = useLibraryStore.getState();
  if (!force && state.hasLoaded && !state.isStale) {
    return;
  }

  if (loadTracksPromise) {
    return loadTracksPromise;
  }

  useLibraryStore.setState({ isLoading: true });
  loadTracksPromise = (async () => {
    try {
      const rows = await window.api.invoke('library:list-summary');
      useLibraryStore.setState({
        tracks: rows as LibraryTrack[],
        isLoading: false,
        hasLoaded: true,
        isStale: false,
      });
    } catch {
      // query failed — keep existing tracks
      useLibraryStore.setState({ isLoading: false });
    } finally {
      loadTracksPromise = null;
    }
  })();

  return loadTracksPromise;
}

export function invalidateTracks(): void {
  useLibraryStore.setState({ isStale: true });
}

export async function refreshTrackSummariesByIds(trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) {
    return;
  }

  const rows = await window.api.invoke('library:list-summary-by-ids', trackIds);
  upsertTrackSummaries(rows as LibraryTrack[]);
}

export function upsertTrackSummaries(rows: LibraryTrack[]): void {
  if (rows.length === 0) {
    return;
  }

  const { tracks } = useLibraryStore.getState();
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  for (const row of rows) {
    tracksById.set(row.id, row);
  }

  useLibraryStore.setState({
    tracks: Array.from(tracksById.values()).sort((left, right) => right.added_at - left.added_at),
    hasLoaded: true,
    isStale: false,
  });
}

/** Mark a track as played in the in-memory store (keeps recently-played section fresh). */
export function markTrackPlayed(trackId: number): void {
  const { tracks } = useLibraryStore.getState();
  const now = Date.now();
  const updated = tracks.map((t) =>
    t.id === trackId
      ? { ...t, play_count: t.play_count + 1, last_played_at: now }
      : t,
  );
  useLibraryStore.setState({ tracks: updated });
}

/** Delete tracks from library using desktop parity semantics. */
export async function deleteTracks(
  trackIds: number[],
  mode: LibraryDeleteMode = 'everywhere',
): Promise<number> {
  const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;
  const result = (await ipc('library:delete-tracks', trackIds, mode)) as { deleted: number };
  const current = useLibraryStore.getState().tracks;
  const idSet = new Set(trackIds);
  useLibraryStore.setState({ tracks: current.filter((t) => !idSet.has(t.id)) });
  return result.deleted;
}

export async function deleteTracksEverywhere(trackIds: number[]): Promise<number> {
  return deleteTracks(trackIds, 'everywhere');
}
