import assert from 'node:assert/strict';
import test from 'node:test';
import { syncProfileData, type ProfileObjectStore, type ProfileSyncLocal } from '../../packages/core/src/services/listening-profile/transport.ts';
import { profileRecordDay, type ProfileSessionRecord } from '../../packages/core/src/services/listening-profile/records.ts';
import type { ProfileDevice } from '../../packages/core/src/types/profile.ts';

function bucket() {
  const objects = new Map<string, { value: unknown; etag: string }>();
  let counter = 0;
  const calls: string[] = [];
  const store: ProfileObjectStore = {
    async getJsonConditional(key, ifNoneMatch) {
      calls.push(`GET ${key}`);
      const found = objects.get(key);
      if (!found) return { status: 'missing', etag: null };
      if (ifNoneMatch === found.etag) return { status: 'not-modified', etag: found.etag };
      return { status: 'ok', value: structuredClone(found.value), etag: found.etag };
    },
    async putJson(key, value) { calls.push(`PUT ${key}`); objects.set(key, { value: structuredClone(value), etag: `e${++counter}` }); },
    async putJsonConditional(key, value, condition) {
      calls.push(`PUTC ${key}`);
      const found = objects.get(key);
      if (condition.ifNoneMatch === '*' && found) return false;
      if (condition.ifMatch && found?.etag !== condition.ifMatch) return false;
      objects.set(key, { value: structuredClone(value), etag: `e${++counter}` });
      return true;
    },
  };
  return { store, objects, calls };
}

function device(deviceId: string, platform: ProfileDevice['platform']) {
  const records = new Map<string, ProfileSessionRecord>();
  const cache = new Map<string, string>();
  const info: ProfileDevice = { device_id: deviceId, name: deviceId, platform };
  const local: ProfileSyncLocal = {
    async device() { return info; },
    async localDays() {
      const days = new Map<string, number>();
      for (const r of records.values()) if (r.device.device_id === deviceId) days.set(profileRecordDay(r), (days.get(profileRecordDay(r)) ?? 0) + r.version);
      return [...days].map(([day, version]) => ({ day, version }));
    },
    async readLocalDay(day) { return [...records.values()].filter((r) => profileRecordDay(r) === day); },
    async importRecords(_id, incoming) { for (const r of incoming) records.set(`${r.device.device_id}:${r.session_id}`, r); },
    async cacheGet(key) { return cache.get(key) ?? null; },
    async cacheSet(key, value) { cache.set(key, value); },
  };
  const add = (sessionId: string, started: number, listened: number, version = 1) => records.set(`${deviceId}:${sessionId}`, {
    device: info, session_id: sessionId, track_id: 1, identity: 'song', title: 'Song', artist: null, album: null, genre: null,
    duration_ms: null, started_at: started, ended_at: started + listened, listened_ms: listened, completed: false, version,
    observations: [], intervals: [],
  });
  return { local, records, add };
}

const DAY = Date.UTC(2026, 5, 10, 12);

test('two devices exchange stats through their own namespace without double counting', async () => {
  const { store, objects } = bucket();
  const pc = device('pc', 'windows');
  const phone = device('phone', 'android');
  pc.add('a', DAY, 60_000);
  phone.add('b', DAY + 1000, 30_000);
  assert.equal((await syncProfileData(store, pc.local, 'ton')).published_days, 1);
  const phoneResult = await syncProfileData(store, phone.local, 'ton');
  assert.equal(phoneResult.imported_devices, 1);
  await syncProfileData(store, pc.local, 'ton');
  assert.equal(pc.records.size, 2);
  assert.equal(phone.records.size, 2);
  const again = await syncProfileData(store, phone.local, 'ton');
  assert.deepEqual(again, { published_days: 0, imported_days: 0, imported_devices: 0 });
  assert.ok([...objects.keys()].every((key) => key.startsWith('ton/system/profile/v1/')));
});

test('an unchanged clean cycle only revalidates the index', async () => {
  const { store, calls } = bucket();
  const pc = device('pc', 'windows');
  pc.add('a', DAY, 60_000);
  await syncProfileData(store, pc.local, 'ton');
  await syncProfileData(store, pc.local, 'ton');
  calls.length = 0;
  await syncProfileData(store, pc.local, 'ton');
  assert.deepEqual(calls, ['GET ton/system/profile/v1/index.json']);
});

test('a later checkpoint of the same session replaces the earlier one and re-publishes only that day', async () => {
  const { store } = bucket();
  const pc = device('pc', 'windows');
  const phone = device('phone', 'android');
  pc.add('a', DAY, 60_000, 1);
  await syncProfileData(store, pc.local, 'ton');
  await syncProfileData(store, phone.local, 'ton');
  pc.add('a', DAY, 120_000, 2);
  assert.equal((await syncProfileData(store, pc.local, 'ton')).published_days, 1);
  await syncProfileData(store, phone.local, 'ton');
  assert.equal(phone.records.get('pc:a')?.listened_ms, 120_000);
});

test('a failed index write is retried without losing the pending day', async () => {
  const { store } = bucket();
  const pc = device('pc', 'windows');
  pc.add('a', DAY, 60_000);
  const original = store.putJsonConditional.bind(store);
  let failures = 1;
  store.putJsonConditional = async (...args) => { if (failures-- > 0) throw new Error('503'); return original(...args); };
  await assert.rejects(syncProfileData(store, pc.local, 'ton'), /503/);
  assert.equal((await syncProfileData(store, pc.local, 'ton')).published_days, 1);
});

test('malformed remote data is rejected and not imported', async () => {
  const { store, objects } = bucket();
  const phone = device('phone', 'android');
  objects.set('ton/system/profile/v1/index.json', { etag: 'x', value: { schema: 1, devices: { evil: { name: 'e', platform: 'windows', version: 1, updated_at: 1 } } } });
  objects.set('ton/system/profile/v1/devices/evil/head.json', { etag: 'y', value: { schema: 1, device: { device_id: 'evil', name: 'e', platform: 'windows' }, days: { '2026-06-10': 1 } } });
  objects.set('ton/system/profile/v1/devices/evil/days/2026-06-10.json', { etag: 'z', value: { schema: 1, day: '2026-06-10', device: { device_id: 'evil', name: 'e', platform: 'windows' }, records: [{ device: { device_id: 'other' } }] } });
  await assert.rejects(syncProfileData(store, phone.local, 'ton'));
  assert.equal(phone.records.size, 0);
});
