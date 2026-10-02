import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import {
  createProfileRecord, mergeProfileRecord, profileRecordDay, syncProfileData, updateProfileRecord,
  type CloudStorageConfig, type ListeningSessionSnapshot, type ProfileDevice, type ProfileObjectStore,
  type ProfileSessionRecord, type ProfileSyncLocal, type ProfileSyncResult, type Track,
} from '@ton/core';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMobileCloudDbLane } from '../cloud-sync/db-lane';
import { MobileR2Client, MobileR2PreconditionFailedError } from '../cloud-sync/r2-client';

const DEVICE_KEY = 'listening_profile_device';

async function readDevice(db: SQLiteDatabase): Promise<ProfileDevice> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [DEVICE_KEY]);
  if (row) return JSON.parse(row.value) as ProfileDevice;
  const device: ProfileDevice = {
    device_id: randomUUID(),
    name: Platform.OS === 'ios' ? 'iOS device' : 'Android device',
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
  };
  await db.runAsync('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)', [DEVICE_KEY, JSON.stringify(device)]);
  const stored = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [DEVICE_KEY]);
  return JSON.parse(stored!.value) as ProfileDevice;
}

export function getMobileProfileDevice(): Promise<ProfileDevice> {
  return runMobileCloudDbLane(readDevice);
}

async function readRecord(db: SQLiteDatabase, deviceId: string, sessionId: string): Promise<ProfileSessionRecord | null> {
  const row = await db.getFirstAsync<{ record: string }>(
    'SELECT record FROM profile_sessions WHERE device_id=? AND session_id=?', [deviceId, sessionId]);
  return row ? JSON.parse(row.record) as ProfileSessionRecord : null;
}

async function saveRecord(db: SQLiteDatabase, record: ProfileSessionRecord): Promise<void> {
  await db.runAsync(
    `INSERT INTO profile_sessions(device_id,session_id,day,version,record) VALUES (?,?,?,?,?)
     ON CONFLICT(device_id,session_id) DO UPDATE SET version=excluded.version,record=excluded.record`,
    [record.device.device_id, record.session_id, profileRecordDay(record), record.version, JSON.stringify(record)]);
}

/** Persist a cumulative checkpoint of an actually observed session; idempotent and never regresses. */
export function recordMobileProfileSnapshot(snapshot: ListeningSessionSnapshot): Promise<boolean> {
  return runMobileCloudDbLane(async (db) => {
    const device = await readDevice(db);
    const old = await readRecord(db, device.device_id, snapshot.session_id);
    const track = await db.getFirstAsync<Track>('SELECT * FROM tracks WHERE id=?', [snapshot.track_id]);
    if (!old && (!track || snapshot.listened_ms === 0)) return false;
    const base = old ?? createProfileRecord(snapshot, track!, device);
    const next = updateProfileRecord(base, snapshot);
    if (next === base && old) return false;
    await saveRecord(db, next);
    return true;
  });
}

export async function getMobileProfilePendingCount(scopeId: string): Promise<number> {
  return runMobileCloudDbLane(async (db) => {
    const device = await readDevice(db);
    const rows = await db.getAllAsync<{ day: string; version: number }>(
      'SELECT day,SUM(version) AS version FROM profile_sessions WHERE device_id=? GROUP BY day', [device.device_id]);
    let pending = 0;
    for (const row of rows) {
      const cached = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM profile_sync_cache WHERE key=?', [`${scopeId}:published:${row.day}`]);
      if (Number(cached?.value ?? 0) !== row.version) pending += 1;
    }
    return pending;
  });
}

function createLocal(scopeId: string): ProfileSyncLocal {
  return {
    device: getMobileProfileDevice,
    localDays: () => runMobileCloudDbLane(async (db) => db.getAllAsync<{ day: string; version: number }>(
      'SELECT day,SUM(version) AS version FROM profile_sessions WHERE device_id=? GROUP BY day', [(await readDevice(db)).device_id])),
    readLocalDay: (day) => runMobileCloudDbLane(async (db) => (await db.getAllAsync<{ record: string }>(
      'SELECT record FROM profile_sessions WHERE device_id=? AND day=?', [(await readDevice(db)).device_id, day]))
      .map((row) => JSON.parse(row.record) as ProfileSessionRecord)),
    importRecords: (deviceId, records) => runMobileCloudDbLane(async (db) => {
      if (deviceId === (await readDevice(db)).device_id) return;
      await db.withTransactionAsync(async () => {
        for (const record of records) {
          if (record.device.device_id !== deviceId) throw new Error('Foreign profile device mismatch');
          const previous = await readRecord(db, deviceId, record.session_id);
          const next = mergeProfileRecord(previous, record);
          if (next !== previous) await saveRecord(db, next);
        }
      });
    }),
    cacheGet: (key) => runMobileCloudDbLane(async (db) => (await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM profile_sync_cache WHERE key=?', [`${scopeId}:${key}`]))?.value ?? null),
    cacheSet: (key, value) => runMobileCloudDbLane(async (db) => {
      await db.runAsync('INSERT OR REPLACE INTO profile_sync_cache(key,value) VALUES (?,?)', [`${scopeId}:${key}`, value]);
    }),
  };
}

function createStore(client: MobileR2Client): ProfileObjectStore {
  return {
    getJsonConditional: (key, ifNoneMatch, signal) => client.getJsonConditional(key, ifNoneMatch ?? undefined, signal as AbortSignal | undefined),
    putJson: (key, value, signal) => client.putJson(key, value, signal as AbortSignal | undefined),
    putJsonConditional: async (key, value, condition, signal) => {
      try {
        await client.putJsonConditional(key, value, { ...condition, signal: signal as AbortSignal | undefined });
        return true;
      } catch (error) {
        if (error instanceof MobileR2PreconditionFailedError) return false;
        throw error;
      }
    },
  };
}

/** Independent of the music manifest, including its unchanged-ETag fast path. */
export function syncMobileProfile(
  config: CloudStorageConfig,
  scopeId: string,
  options: { publish?: boolean; fetch?: boolean; signal?: AbortSignal } = {},
): Promise<ProfileSyncResult> {
  return syncProfileData(createStore(new MobileR2Client(config)), createLocal(scopeId), config.prefix, options);
}
