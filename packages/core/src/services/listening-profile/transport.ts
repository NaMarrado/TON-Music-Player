import type { CloudAbortSignal, CloudConditionalJsonReadResult } from '../../types/cloud-sync';
import type { ProfileDevice } from '../../types/profile';
import { normalizeCloudPrefix } from '../cloud-sync/manifest-keys';
import { profileRecordDay, validateProfileRecord, validProfileId, type ProfileSessionRecord } from './records';

/**
 * Private listening statistics live in their own namespace and never touch the
 * music manifest:
 *   <prefix>/system/profile/v1/index.json                      tiny shared directory of devices
 *   <prefix>/system/profile/v1/devices/<id>/head.json          per-device day -> version map
 *   <prefix>/system/profile/v1/devices/<id>/days/<day>.json    immutable-owner chunk of one UTC day
 * Each device writes only its own head/chunks; only index.json is shared and is
 * updated with a conditional read-modify-write of the device's own entry.
 */
const MAX_INDEX_RETRIES = 6;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORMS = ['windows', 'macos', 'linux', 'android', 'ios', 'unknown'];

export interface ProfileIndexEntry { name: string; platform: ProfileDevice['platform']; version: number; updated_at: number }
export interface ProfileIndex { schema: 1; devices: Record<string, ProfileIndexEntry> }
export interface ProfileHead { schema: 1; device: ProfileDevice; days: Record<string, number> }
export interface ProfileChunk { schema: 1; device: ProfileDevice; day: string; records: ProfileSessionRecord[] }

export function profileSyncKeys(prefix: string) {
  const root = `${normalizeCloudPrefix(prefix)}/system/profile/v1`;
  return {
    index: `${root}/index.json`,
    head: (deviceId: string) => `${root}/devices/${deviceId}/head.json`,
    day: (deviceId: string, day: string) => `${root}/devices/${deviceId}/days/${day}.json`,
  };
}

/** Minimal storage surface implemented by the desktop and mobile signed R2 clients. */
export interface ProfileObjectStore {
  getJsonConditional<T>(key: string, ifNoneMatch?: string | null, signal?: CloudAbortSignal): Promise<CloudConditionalJsonReadResult<T>>;
  putJson(key: string, value: unknown, signal?: CloudAbortSignal): Promise<void>;
  /** Returns false on a failed precondition; throws on every other error. */
  putJsonConditional(key: string, value: unknown, condition: { ifMatch?: string; ifNoneMatch?: '*' }, signal?: CloudAbortSignal): Promise<boolean>;
}

/** Local persistence adapter. Cache keys are scoped by the adapter to the active R2 bucket/prefix. */
export interface ProfileSyncLocal {
  device(): Promise<ProfileDevice>;
  localDays(): Promise<{ day: string; version: number }[]>;
  readLocalDay(day: string): Promise<ProfileSessionRecord[]>;
  importRecords(deviceId: string, records: ProfileSessionRecord[]): Promise<void>;
  cacheGet(key: string): Promise<string | null>;
  cacheSet(key: string, value: string): Promise<void>;
}

export interface ProfileSyncResult { published_days: number; imported_days: number; imported_devices: number }

const isObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function validateDevice(value: unknown, expectedId?: string): ProfileDevice {
  if (!isObject(value) || !validProfileId(value.device_id) || (expectedId != null && value.device_id !== expectedId)
    || typeof value.name !== 'string' || value.name.length > 256
    || typeof value.platform !== 'string' || !PLATFORMS.includes(value.platform)) throw new Error('profile_sync_invalid_device');
  return { device_id: value.device_id, name: value.name, platform: value.platform as ProfileDevice['platform'] };
}

export function parseProfileIndex(value: unknown): ProfileIndex {
  if (!isObject(value) || value.schema !== 1 || !isObject(value.devices)) throw new Error('profile_sync_invalid_index');
  const devices: Record<string, ProfileIndexEntry> = {};
  for (const [id, raw] of Object.entries(value.devices)) {
    const entry = raw as Partial<ProfileIndexEntry> | null;
    if (!validProfileId(id) || !isObject(entry) || typeof entry.name !== 'string' || entry.name.length > 256
      || !PLATFORMS.includes(entry.platform as string) || !version(entry.version) || !version(entry.updated_at)) throw new Error('profile_sync_invalid_index');
    devices[id] = { name: entry.name, platform: entry.platform as ProfileDevice['platform'], version: entry.version, updated_at: entry.updated_at };
  }
  return { schema: 1, devices };
}

export function parseProfileHead(value: unknown, deviceId: string): ProfileHead {
  if (!isObject(value) || value.schema !== 1 || !isObject(value.days)) throw new Error('profile_sync_invalid_head');
  const days: Record<string, number> = {};
  for (const [day, v] of Object.entries(value.days)) {
    if (!DAY.test(day) || !version(v)) throw new Error('profile_sync_invalid_head');
    days[day] = v;
  }
  return { schema: 1, device: validateDevice(value.device, deviceId), days };
}

export function parseProfileChunk(value: unknown, deviceId: string, day: string): ProfileChunk {
  if (!isObject(value) || value.schema !== 1 || value.day !== day || !Array.isArray(value.records) || value.records.length > 20_000) throw new Error('profile_sync_invalid_chunk');
  const device = validateDevice(value.device, deviceId);
  const records = value.records as ProfileSessionRecord[];
  const sessions = new Set<string>();
  for (const record of records) {
    validateProfileRecord(record, deviceId);
    if (profileRecordDay(record) !== day || sessions.has(record.session_id)) throw new Error('profile_sync_invalid_chunk');
    sessions.add(record.session_id);
  }
  return { schema: 1, device, day, records };
}

export function profileChunkVersion(records: ProfileSessionRecord[]): number {
  return records.reduce((sum, record) => sum + record.version, 0);
}

async function publishLocal(store: ProfileObjectStore, local: ProfileSyncLocal, prefix: string, signal?: CloudAbortSignal): Promise<number> {
  const keys = profileSyncKeys(prefix);
  const device = await local.device();
  const days = await local.localDays();
  const published = new Map<string, number>();
  const pending: string[] = [];
  for (const { day, version: current } of days) {
    const cached = Number(await local.cacheGet(`published:${day}`) ?? -1);
    if (cached === current) published.set(day, cached); else pending.push(day);
  }
  if (!pending.length) return 0;
  for (const day of pending.sort()) {
    const records = (await local.readLocalDay(day)).filter((record) => record.device.device_id === device.device_id);
    if (!records.length) continue;
    const chunk: ProfileChunk = { schema: 1, device, day, records };
    await store.putJson(keys.day(device.device_id, day), chunk, signal);
    published.set(day, profileChunkVersion(records));
  }
  const days_: Record<string, number> = {};
  for (const day of [...published.keys()].sort()) days_[day] = published.get(day)!;
  const head: ProfileHead = { schema: 1, device, days: days_ };
  await store.putJson(keys.head(device.device_id), head, signal);
  const total = Object.values(days_).reduce((sum, value) => sum + value, 0);
  for (let attempt = 0; attempt < MAX_INDEX_RETRIES; attempt += 1) {
    const read = await store.getJsonConditional<unknown>(keys.index, null, signal);
    const index = read.status === 'ok' ? parseProfileIndex(read.value) : { schema: 1 as const, devices: {} };
    index.devices[device.device_id] = { name: device.name, platform: device.platform, version: total, updated_at: Date.now() };
    const accepted = await store.putJsonConditional(keys.index, index,
      read.status === 'ok' ? { ifMatch: read.etag } : { ifNoneMatch: '*' }, signal);
    if (accepted) {
      // Acknowledge only after head+index both name the chunk; retries stay idempotent until then.
      for (const [day, v] of published) await local.cacheSet(`published:${day}`, String(v));
      return pending.length;
    }
  }
  throw new Error('profile_sync_index_contention');
}

async function importRemote(store: ProfileObjectStore, local: ProfileSyncLocal, prefix: string, signal?: CloudAbortSignal): Promise<{ days: number; devices: number }> {
  const keys = profileSyncKeys(prefix);
  const self = (await local.device()).device_id;
  const read = await store.getJsonConditional<unknown>(keys.index, await local.cacheGet('index_etag'), signal);
  if (read.status !== 'ok') return { days: 0, devices: 0 };
  const index = parseProfileIndex(read.value);
  let days = 0, devices = 0, failure: unknown = null;
  for (const [id, entry] of Object.entries(index.devices)) {
    if (id === self) continue;
    try {
      if (await local.cacheGet(`remote:${id}`) === String(entry.version)) continue;
      const headRead = await store.getJsonConditional<unknown>(keys.head(id), null, signal);
      if (headRead.status !== 'ok') throw new Error('profile_sync_missing_head');
      const head = parseProfileHead(headRead.value, id);
      let changed = false;
      for (const day of Object.keys(head.days).sort()) {
        if (await local.cacheGet(`remote:${id}:${day}`) === String(head.days[day])) continue;
        const chunkRead = await store.getJsonConditional<unknown>(keys.day(id, day), null, signal);
        if (chunkRead.status !== 'ok') throw new Error('profile_sync_missing_chunk');
        const chunk = parseProfileChunk(chunkRead.value, id, day);
        await local.importRecords(id, chunk.records);
        await local.cacheSet(`remote:${id}:${day}`, String(head.days[day]));
        days += 1; changed = true;
      }
      await local.cacheSet(`remote:${id}`, String(entry.version));
      if (changed) devices += 1;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  if (read.etag) await local.cacheSet('index_etag', read.etag);
  return { days, devices };
}

/** One idempotent cycle: publish own pending day chunks, then import changed foreign ones. */
export async function syncProfileData(
  store: ProfileObjectStore,
  local: ProfileSyncLocal,
  prefix: string,
  options: { publish?: boolean; fetch?: boolean; signal?: CloudAbortSignal } = {},
): Promise<ProfileSyncResult> {
  const published = options.publish === false ? 0 : await publishLocal(store, local, prefix, options.signal);
  const imported = options.fetch === false ? { days: 0, devices: 0 } : await importRemote(store, local, prefix, options.signal);
  return { published_days: published, imported_days: imported.days, imported_devices: imported.devices };
}
