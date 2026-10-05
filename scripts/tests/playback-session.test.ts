import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFollowingRollingQueueWindow,
  createRollingQueueWindow,
  ListeningTimeAccumulator,
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

test('restores 100 previous and 20 upcoming tracks around the current item', () => {
  const queue = Array.from({ length: 180 }, (_, index) => ({
    ...sourceItem(index + 1),
    id: `queue-${index}`,
    source_index: index,
  }));
  const snapshot = parsePlaybackSessionSnapshot({
    queue,
    source_items: queue,
    previous_windows: [],
    next_queue_serial: queue.length,
    current_index: 140,
    position_seconds: 12,
    repeat: 'all',
    shuffle: false,
    source: 'user',
  });

  assert.ok(snapshot);
  assert.equal(snapshot.queue.length, 121);
  assert.equal(snapshot.current_index, 100);
  assert.equal(snapshot.queue[0]?.track_id, 41);
  assert.equal(snapshot.queue[100]?.track_id, 141);
  assert.equal(snapshot.queue.at(-1)?.track_id, 161);
});

test('persisted rolling history keeps only the latest 100 tracks', () => {
  const windows = Array.from({ length: 7 }, (_, windowIndex) => (
    Array.from({ length: 20 }, (_, itemIndex) => {
      const index = windowIndex * 20 + itemIndex;
      return {
        ...sourceItem(index + 1),
        id: `history-${index}`,
        source_index: index,
      };
    })
  ));
  const current = [{ ...sourceItem(1_000), id: 'current', source_index: 999 }];
  const snapshot = parsePlaybackSessionSnapshot({
    queue: current,
    source_items: [...windows.flat(), ...current],
    previous_windows: windows,
    next_queue_serial: 141,
    current_index: 0,
    position_seconds: 0,
    repeat: 'all',
    shuffle: false,
    source: 'user',
  });

  assert.ok(snapshot);
  const retainedHistory = snapshot.previous_windows?.flat() ?? [];
  assert.equal(retainedHistory.length, 100);
  assert.equal(retainedHistory[0]?.track_id, 41);
  assert.equal(retainedHistory.at(-1)?.track_id, 140);
});

test('listening clock counts advancing audio and excludes paused and buffering intervals', () => {
  const clock = new ListeningTimeAccumulator();
  clock.sample(0, 0, true);
  clock.sample(1_000, 1, true);
  clock.sample(1_500, 1.5, false);
  clock.sample(61_500, 1.5, false);
  clock.sample(62_000, 1.5, true);
  clock.sample(63_000, 2.5, true);
  assert.equal(clock.listenedMs, 2_500);

  clock.sample(63_500, 3, false);
  clock.sample(73_500, 3, false);
  clock.sample(74_000, 3, true);
  clock.sample(75_000, 4, true);
  assert.equal(clock.listenedMs, 4_000);
});

test('listening clock caps stalled playback by real media progress', () => {
  const clock = new ListeningTimeAccumulator();
  clock.sample(0, 0, true);
  clock.sample(30_000, 2, true);
  clock.sample(60_000, 2, true);
  assert.equal(clock.listenedMs, 2_000);
});

test('forward and backward seeks never become listening time', () => {
  const clock = new ListeningTimeAccumulator();
  clock.sample(0, 0, true);
  clock.sample(1_000, 1, true);
  clock.sample(1_250, 180, true);
  clock.sample(2_250, 181, true);
  clock.sample(2_500, 10, true);
  assert.equal(clock.listenedMs, 2_000);

  clock.resetBaseline();
  clock.sample(2_750, 20, true);
  clock.sample(3_750, 21, true);
  assert.equal(clock.listenedMs, 3_000);
});

test('restored listening clocks neither count downtime nor duplicate a terminal sample', () => {
  const clock = new ListeningTimeAccumulator(7_500);
  clock.sample(0, 50, false);
  clock.sample(3_600_000, 50, true);
  clock.sample(3_601_000, 51, false);
  clock.sample(3_601_000, 51, false);
  assert.equal(clock.listenedMs, 8_500);
});

test('playback-rate changes measure elapsed listening rather than source duration', () => {
  const clock = new ListeningTimeAccumulator();
  clock.sample(0, 0, true, 2);
  clock.sample(1_000, 2, true, 0.5);
  clock.sample(2_000, 2.5, false, 0.5);
  assert.equal(clock.listenedMs, 2_000);
});
