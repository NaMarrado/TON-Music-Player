import type Database from 'better-sqlite3';
import { syncProfileData, type CloudStorageConfig, type ProfileObjectStore, type ProfileSessionRecord, type ProfileSyncLocal, type ProfileSyncResult } from '@ton/core';
import { getDb } from '../database/connection';
import {
  backfillDesktopProfileRecords, getDesktopProfileDevice, importDesktopProfileRecords, readDesktopProfileRecords,
} from '../listening-profile/store';
import { DesktopR2Client } from './r2-client';

export function createDesktopProfileStore(client: DesktopR2Client): ProfileObjectStore {
  return {
    getJsonConditional: (key, ifNoneMatch, signal) => client.getJsonConditional(key, { ifNoneMatch, signal }),
    putJson: (key, value, signal) => client.putJson(key, value, signal as AbortSignal | undefined),
    putJsonConditional: async (key, value, condition, signal) => (
      (await client.putJsonConditional(key, value, { ...condition, signal })).status === 'ok'
    ),
  };
}

export function createDesktopProfileLocal(scopeId: string, db: Database.Database = getDb()): ProfileSyncLocal {
  backfillDesktopProfileRecords(db);
  const device = getDesktopProfileDevice(db);
  return {
    device: async () => device,
    localDays: async () => (db.prepare('SELECT day, SUM(version) AS version FROM profile_sessions WHERE device_id=? GROUP BY day')
      .all(device.device_id) as { day: string; version: number }[]),
    readLocalDay: async (day) => readDesktopProfileRecords(db, device.device_id, day) as ProfileSessionRecord[],
    importRecords: async (deviceId, records) => importDesktopProfileRecords(db, records, deviceId),
    cacheGet: async (key) => (db.prepare('SELECT value FROM profile_sync_cache WHERE key=?').get(`${scopeId}:${key}`) as { value: string } | undefined)?.value ?? null,
    cacheSet: async (key, value) => { db.prepare('INSERT OR REPLACE INTO profile_sync_cache(key,value) VALUES (?,?)').run(`${scopeId}:${key}`, value); },
  };
}

/** Independent of music manifest state; safe to run on every cycle including the 304 fast path. */
export function syncDesktopProfile(
  config: CloudStorageConfig,
  scopeId: string,
  options: { publish?: boolean; fetch?: boolean; signal?: AbortSignal } = {},
): Promise<ProfileSyncResult> {
  return syncProfileData(createDesktopProfileStore(new DesktopR2Client(config)), createDesktopProfileLocal(scopeId), config.prefix, options);
}
