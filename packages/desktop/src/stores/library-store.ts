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
const LIBRARY_RECONCILE_DELAY_MS = 100;
const LIBRARY_RETRY_DELAY_MS = 500;
const LIBRARY_RETRY_MAX_ATTEMPTS = 3;
let loadTracksPromise: Promise<void> | null = null;
let libraryRevision = 0;
let lastAppliedRevision = -1;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileRetryTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileRetryAttempt = 0;
let reconcileWaiters: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];

async function waitForLibraryRevisionToSettle(): Promise<void> {
  while (true) {
    const revisionAtStart = libraryRevision;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, LIBRARY_RECONCILE_DELAY_MS);
    });
    if (revisionAtStart === libraryRevision) {
      return;
    }
  }
}

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
      // Re-run the snapshot if a mutation landed while IPC was in flight. This
      // prevents an older full-library response from replacing newer DB state.
      while (true) {
        const revisionAtRequest = libraryRevision;
        const rows = await window.api.invoke('library:list-summary');
        if (revisionAtRequest !== libraryRevision) {
          await waitForLibraryRevisionToSettle();
          continue;
        }

        lastAppliedRevision = revisionAtRequest;
        useLibraryStore.setState({
          tracks: rows as LibraryTrack[],
          isLoading: false,
          hasLoaded: true,
          isStale: false,
        });
        cancelLibraryRetry();
        break;
      }
    } catch (error) {
      // query failed — keep existing tracks
      useLibraryStore.setState({ isLoading: false, isStale: true });
      throw error;
    } finally {
      loadTracksPromise = null;
    }
  })();

  return loadTracksPromise;
}

export function invalidateTracks(): void {
  libraryRevision += 1;
  useLibraryStore.setState({ isStale: true });
}

function cancelLibraryRetry(): void {
  if (reconcileRetryTimer) {
    clearTimeout(reconcileRetryTimer);
    reconcileRetryTimer = null;
  }
  reconcileRetryAttempt = 0;
}

async function flushLibraryReconcile(): Promise<void> {
  if (reconcileTimer) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
  if (reconcileRetryTimer) {
    clearTimeout(reconcileRetryTimer);
    reconcileRetryTimer = null;
  }

  try {
    await loadTracks({ force: true });
    if (lastAppliedRevision === libraryRevision && reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }

    const waiters = reconcileWaiters;
    reconcileWaiters = [];
    waiters.forEach(({ resolve }) => resolve());
  } catch (error) {
    const waiters = reconcileWaiters;
    reconcileWaiters = [];
    waiters.forEach(({ reject }) => reject(error));
    scheduleLibraryRetry();
    throw error;
  }
}

function scheduleLibraryRetry(): void {
  if (
    reconcileRetryTimer
    || !useLibraryStore.getState().isStale
    || reconcileRetryAttempt >= LIBRARY_RETRY_MAX_ATTEMPTS
  ) {
    return;
  }

  const delay = LIBRARY_RETRY_DELAY_MS * (2 ** reconcileRetryAttempt);
  reconcileRetryAttempt += 1;
  reconcileRetryTimer = setTimeout(() => {
    reconcileRetryTimer = null;
    if (!useLibraryStore.getState().isStale) {
      reconcileRetryAttempt = 0;
      return;
    }
    void flushLibraryReconcile().catch(() => {});
  }, delay);
}

function scheduleLibraryReconcile(): Promise<void> {
  return new Promise((resolve, reject) => {
    reconcileWaiters.push({ resolve, reject });
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
  invalidateTracks();
  const { immediate = false, loadIfUninitialized = false } = options;
  if (!loadIfUninitialized && !useLibraryStore.getState().hasLoaded && !loadTracksPromise) {
    // An initial authoritative load may already have failed and scheduled a
    // retry. A passive invalidation must not cancel that only recovery path.
    return;
  }

  cancelLibraryRetry();
  if (immediate) {
    await flushLibraryReconcile();
    return;
  }

  await scheduleLibraryReconcile();
}

export async function mergeLibraryTrackSummaries(trackIds: number[]): Promise<void> {
  const uniqueIds = [...new Set(trackIds)];
  if (uniqueIds.length === 0) return;
  const incoming = await window.api.invoke('library:list-summary-by-ids', uniqueIds) as LibraryTrack[];
  if (incoming.length === 0) return;
  useLibraryStore.setState((state) => {
    const byId = new Map(state.tracks.map((track) => [track.id, track]));
    incoming.forEach((track) => byId.set(track.id, track));
    return {
      tracks: [...byId.values()].sort((left, right) => (
        right.added_at - left.added_at
        || (left.content_hash_sha256 ?? '').localeCompare(right.content_hash_sha256 ?? '')
        || right.id - left.id
      )),
      hasLoaded: true,
      isStale: false,
    };
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
  invalidateTracks();
  try {
    const result = (await ipc('library:delete-tracks', trackIds, mode)) as { deleted: number };
    const current = useLibraryStore.getState().tracks;
    const idSet = new Set(trackIds);
    useLibraryStore.setState({ tracks: current.filter((t) => !idSet.has(t.id)) });
    await reconcileLibraryTracks({ immediate: true }).catch(() => {});
    return result.deleted;
  } catch (error) {
    await reconcileLibraryTracks({ immediate: true }).catch(() => {});
    throw error;
  }
}

export async function deleteTracksEverywhere(trackIds: number[]): Promise<number> {
  return deleteTracks(trackIds, 'everywhere');
}
