import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFollowingRollingQueueWindow,
  createRollingQueueWindow,
  parsePlaybackSessionSnapshot,
  type QueueItem,
} from '../../packages/core/src/index.ts';

function sourceItem(trackId: number): QueueItem {
  return {
    id: `source-${trackId}`,
    track_id: trackId,
    added_by: 'user',
  };
}

test('keeps a rolling queue at twenty items while drawing from the full source', () => {
  const source = Array.from({ length: 100 }, (_, index) => sourceItem(index + 1));
  const initial = createRollingQueueWindow(source, 50, 7, false);
  const following = createFollowingRollingQueueWindow(
    source,
    initial.items.at(-1)!,
    7,
    false,
    initial.nextSerial,
  );

  assert.equal(initial.items.length, 20);
  assert.equal(initial.items[0]?.track_id, 51);
  assert.equal(initial.items.at(-1)?.track_id, 70);
  assert.equal(following.items.length, 20);
  assert.equal(following.items[0]?.track_id, 71);
});

test('persists exact previous and next rolling windows for navigation history', () => {
  const current = Array.from({ length: 20 }, (_, index) => ({
    ...sourceItem(index + 21),
    id: `current-${index}`,
    source_index: index + 20,
  }));
  const previous = Array.from({ length: 20 }, (_, index) => ({
    ...sourceItem(index + 1),
    id: `previous-${index}`,
    source_index: index,
  }));
  const next = Array.from({ length: 20 }, (_, index) => ({
    ...sourceItem(index + 41),
    id: `next-${index}`,
    source_index: index + 40,
  }));

  const snapshot = parsePlaybackSessionSnapshot(JSON.stringify({
    queue: current,
    source_items: [...previous, ...current, ...next],
    previous_windows: [previous],
    next_windows: [next],
    next_queue_serial: 60,
    current_index: 0,
    position_seconds: 8,
    repeat: 'all',
    shuffle: true,
    source: 'user',
    source_descriptor: { kind: 'library' },
  }));

  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.previous_windows?.[0]?.map((item) => item.track_id),
    previous.map((item) => item.track_id),
  );
  assert.deepEqual(
    snapshot.next_windows?.[0]?.map((item) => item.track_id),
    next.map((item) => item.track_id),
  );
});

test('drops malformed or oversized persisted history windows', () => {
  const current = [sourceItem(1)];
  const oversized = Array.from({ length: 21 }, (_, index) => ({
    ...sourceItem(index + 2),
    id: `oversized-${index}`,
  }));
  const snapshot = parsePlaybackSessionSnapshot({
    queue: current,
    source_items: current,
    previous_windows: [oversized, [], 'invalid'],
    next_queue_serial: 1,
    current_index: 0,
    position_seconds: 0,
    repeat: 'all',
    shuffle: false,
    source: 'user',
  });

  assert.ok(snapshot);
  assert.deepEqual(snapshot.previous_windows, []);
});
