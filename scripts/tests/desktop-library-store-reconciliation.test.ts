import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadTracks,
  reconcileLibraryTracks,
  useLibraryStore,
  type LibraryTrack,
} from '../../packages/desktop/src/stores/library-store';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('library reconciliation discards a stale snapshot and coalesces completion bursts', async () => {
  const firstSnapshot = deferred<LibraryTrack[]>();
  const staleTrack = { id: 1, added_at: 1 } as LibraryTrack;
  const latestTrack = { id: 2, added_at: 2 } as LibraryTrack;
  const burstTrack = { id: 3, added_at: 3 } as LibraryTrack;
  let currentSnapshot = [latestTrack];
  let invocationCount = 0;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        invoke: () => {
          invocationCount += 1;
          return invocationCount === 1
            ? firstSnapshot.promise
            : Promise.resolve(currentSnapshot);
        },
      },
    },
  });
  useLibraryStore.setState({
    tracks: [],
    isLoading: false,
    hasLoaded: false,
    isStale: false,
  });

  const initialLoad = loadTracks({ force: true });
  assert.equal(invocationCount, 1);
  const reconcile = reconcileLibraryTracks();
  firstSnapshot.resolve([staleTrack]);
  await Promise.all([initialLoad, reconcile]);

  assert.equal(invocationCount, 2);
  assert.deepEqual(useLibraryStore.getState().tracks.map((track) => track.id), [2]);
  assert.equal(useLibraryStore.getState().isStale, false);

  currentSnapshot = [burstTrack];
  await Promise.all([
    reconcileLibraryTracks(),
    reconcileLibraryTracks(),
    reconcileLibraryTracks(),
  ]);

  assert.equal(invocationCount, 3);
  assert.deepEqual(useLibraryStore.getState().tracks.map((track) => track.id), [3]);
});

test('failed authoritative reload remains stale and retries in the background', async () => {
  const existingTrack = { id: 3, added_at: 3 } as LibraryTrack;
  const recoveredTrack = { id: 4, added_at: 4 } as LibraryTrack;
  let invocationCount = 0;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        invoke: () => {
          invocationCount += 1;
          return invocationCount === 1
            ? Promise.reject(new Error('transient-library-failure'))
            : Promise.resolve([recoveredTrack]);
        },
      },
    },
  });
  useLibraryStore.setState({
    tracks: [existingTrack],
    isLoading: false,
    hasLoaded: true,
    isStale: false,
  });

  await assert.rejects(
    reconcileLibraryTracks({ immediate: true }),
    /transient-library-failure/,
  );
  assert.equal(useLibraryStore.getState().isStale, true);
  assert.deepEqual(useLibraryStore.getState().tracks.map((track) => track.id), [3]);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 650);
  });

  assert.equal(invocationCount, 2);
  assert.equal(useLibraryStore.getState().isStale, false);
  assert.deepEqual(useLibraryStore.getState().tracks.map((track) => track.id), [4]);
});

test('passive invalidation preserves recovery from a failed initial load', async () => {
  const recoveredTrack = { id: 5, added_at: 5 } as LibraryTrack;
  let invocationCount = 0;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        invoke: () => {
          invocationCount += 1;
          return invocationCount === 1
            ? Promise.reject(new Error('initial-library-failure'))
            : Promise.resolve([recoveredTrack]);
        },
      },
    },
  });
  useLibraryStore.setState({
    tracks: [],
    isLoading: false,
    hasLoaded: false,
    isStale: false,
  });

  await assert.rejects(
    reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
    /initial-library-failure/,
  );
  await reconcileLibraryTracks();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 650);
  });

  assert.equal(invocationCount, 2);
  assert.equal(useLibraryStore.getState().hasLoaded, true);
  assert.equal(useLibraryStore.getState().isStale, false);
  assert.deepEqual(useLibraryStore.getState().tracks.map((track) => track.id), [5]);
});

test('a direct successful load cancels an already scheduled retry', async () => {
  const existingTrack = { id: 5, added_at: 5 } as LibraryTrack;
  const recoveredTrack = { id: 6, added_at: 6 } as LibraryTrack;
  let invocationCount = 0;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        invoke: () => {
          invocationCount += 1;
          return invocationCount === 1
            ? Promise.reject(new Error('transient-library-failure'))
            : Promise.resolve([recoveredTrack]);
        },
      },
    },
  });
  useLibraryStore.setState({
    tracks: [existingTrack],
    isLoading: false,
    hasLoaded: true,
    isStale: false,
  });

  await assert.rejects(
    reconcileLibraryTracks({ immediate: true }),
    /transient-library-failure/,
  );
  await loadTracks({ force: true });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 650);
  });

  assert.equal(invocationCount, 2);
  assert.equal(useLibraryStore.getState().isStale, false);
  assert.deepEqual(useLibraryStore.getState().tracks.map((track) => track.id), [6]);
});

test('permanent reload failures stop after the bounded retry budget', async () => {
  let invocationCount = 0;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        invoke: () => {
          invocationCount += 1;
          return Promise.reject(new Error('permanent-library-failure'));
        },
      },
    },
  });
  useLibraryStore.setState({
    tracks: [],
    isLoading: false,
    hasLoaded: true,
    isStale: false,
  });

  await assert.rejects(
    reconcileLibraryTracks({ immediate: true }),
    /permanent-library-failure/,
  );
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 3900);
  });
  assert.equal(invocationCount, 4);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 650);
  });
  assert.equal(invocationCount, 4);
  assert.equal(useLibraryStore.getState().isStale, true);
});
