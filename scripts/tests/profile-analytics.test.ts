import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfileAnalytics } from '../../packages/core/src/services/listening-profile/analytics.ts';
import type { ProfileSessionRecord } from '../../packages/core/src/services/listening-profile/records.ts';
import type { ProfileDevice } from '../../packages/core/src/types/profile.ts';

const PC: ProfileDevice = { device_id: 'pc', name: 'PC', platform: 'windows' };
const PHONE: ProfileDevice = { device_id: 'phone', name: 'Phone', platform: 'android' };
const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();

function record(device: ProfileDevice, id: string, start: number, overrides: Partial<ProfileSessionRecord> & { volume?: number } = {}): ProfileSessionRecord {
  const { volume = 40, ...rest } = overrides;
  return {
    device, session_id: id, track_id: 1, identity: 'song-a', title: 'Song A', artist: 'Artist', album: 'Album', genre: 'Rock',
    duration_ms: 200_000, started_at: start, ended_at: start + 60_000, listened_ms: 60_000, completed: false, version: 1,
    observations: [],
    intervals: [{
      interval_id: `${id}-i`, session_id: id, device_id: device.device_id, started_at: start, ended_at: start + 60_000,
      listened_ms: 60_000, volume_percent: volume, system_volume_percent: null, muted: false, playback_rate: 1, shuffle: false, repeat: 'off',
    }],
    ...rest,
  };
}

test('time at each volume is attributed per interval and split by device', () => {
  const start = new Date(2026, 5, 14, 20, 0, 0).getTime();
  const records = [record(PC, 's1', start, { volume: 20 }), record(PHONE, 's2', start + 600_000, { volume: 80 })];
  const all = buildProfileAnalytics(records, [], 'pc', { period: 'month' }, NOW);
  assert.equal(all.totals.listened_ms, 120_000);
  assert.deepEqual(all.volume.map((v) => [v.volume_percent, v.listened_ms]), [[20, 60_000], [80, 60_000]]);
  assert.equal(all.devices.length, 2);
  const phoneOnly = buildProfileAnalytics(records, [], 'pc', { period: 'month', device_id: 'phone' }, NOW);
  assert.equal(phoneOnly.totals.listened_ms, 60_000);
  assert.deepEqual(phoneOnly.volume.map((v) => v.volume_percent), [80]);
});

test('an interval crossing the period boundary is split instead of counted twice', () => {
  const midnight = new Date(2026, 5, 15, 0, 0, 0).getTime();
  const crossing = record(PC, 's1', midnight - 30_000);
  const previous = buildProfileAnalytics([crossing], [], 'pc', { period: 'week' }, NOW);
  assert.equal(previous.totals.listened_ms, 60_000);
  const before = buildProfileAnalytics([crossing], [], 'pc', { period: 'week' }, new Date(2026, 5, 14, 12).getTime());
  assert.equal(before.totals.listened_ms, 30_000);
  const day14 = previous.timeline.find((p) => p.date === '2026-06-14');
  const day15 = previous.timeline.find((p) => p.date === '2026-06-15');
  assert.equal((day14?.listened_ms ?? 0) + (day15?.listened_ms ?? 0), 60_000);
  assert.equal(day14?.listened_ms, 30_000);
});

test('legacy measured time without intervals is reported as unlocated, never placed on the clock', () => {
  const legacy = record(PC, 'old', new Date(2026, 5, 14, 9).getTime(), { intervals: [], listened_ms: 90_000 });
  const result = buildProfileAnalytics([legacy], [], 'pc', { period: 'month' }, NOW);
  assert.equal(result.unlocated_listened_ms, 90_000);
  assert.equal(result.hours.reduce((sum, h) => sum + h.listened_ms, 0), 0);
  assert.equal(result.volume.length, 1);
  assert.equal(result.volume[0].volume_percent, null);
});

test('a session counts as one play and period filters exclude other periods', () => {
  const recent = record(PC, 'recent', new Date(2026, 5, 14, 10).getTime());
  const old = record(PC, 'old', new Date(2025, 0, 3, 10).getTime());
  const week = buildProfileAnalytics([recent, old], [], 'pc', { period: 'week' }, NOW);
  assert.equal(week.totals.plays, 1);
  assert.equal(week.tracks[0].plays, 1);
  const year2025 = buildProfileAnalytics([recent, old], [], 'pc', { period: 'year', year: 2025 }, NOW);
  assert.equal(year2025.totals.plays, 1);
  assert.equal(year2025.history[0].session_id, 'old');
  const all = buildProfileAnalytics([recent, old], [], 'pc', { period: 'all' }, NOW);
  assert.equal(all.totals.plays, 2);
  assert.deepEqual(all.available_years, [2026, 2025]);
});

test('invalid period or year is rejected', () => {
  assert.throws(() => buildProfileAnalytics([], [], 'pc', { period: 'decade' as 'all' }, NOW));
  assert.throws(() => buildProfileAnalytics([], [], 'pc', { period: 'year', year: 2999 }, NOW));
});
