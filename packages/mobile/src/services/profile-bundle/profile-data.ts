import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  buildProfileBundle,
  mergeProfileRecord,
  starIdentity,
  type ParsedProfileBundle,
  type ProfileBundle,
  type ProfileBundlePlatform,
  type ProfileSessionRecord,
} from '@ton/core';
import { getMobileCloudConfig, saveMobileCloudConfig } from '../cloud-sync/config';
import { runMobileCloudDbLane } from '../cloud-sync/db-lane';
import { getDb } from '../database';

const platform: ProfileBundlePlatform = Platform.OS === 'ios' ? 'ios' : 'android';

/**
 * Reads the profile part of a Profile export from this phone: settings and keys, the R2 connection with its secret,
 * stars and listening history. Device-bound settings are dropped by the shared builder.
 */
/** The name this phone uses in the listening history, read from its stored device entry. */
function parseDeviceName(stored: string | undefined): string | null {
  if (!stored) return null;
  try {
    const device: unknown = JSON.parse(stored);
    return typeof device === 'object' && device !== null && 'name' in device && typeof device.name === 'string' ? device.name : null;
  } catch {
    return null;
  }
}

export async function collectMobileProfile(): Promise<ProfileBundle> {
  const cloud = await getMobileCloudConfig();
  // The app's own connection: the export runs on it too, so a second connection could find the database locked.
  const db = getDb();
  const settings: Record<string, string> = {};
  for (const row of await db.getAllAsync<{ key: string; value: string | null }>('SELECT key, value FROM settings')) {
    if (row.value !== null) settings[row.key] = row.value;
  }
  const starred: string[] = [];
  for (const track of await db.getAllAsync<{ content_hash_sha256: string | null; file_hash: string | null }>('SELECT content_hash_sha256, file_hash FROM tracks WHERE COALESCE(rating, 0) > 0')) {
    const identity = starIdentity(track);
    if (identity) starred.push(identity);
  }
  const listening: ProfileSessionRecord[] = [];
  for (const row of await db.getAllAsync<{ record: string }>('SELECT record FROM profile_sessions')) listening.push(JSON.parse(row.record));
  const deviceName = parseDeviceName(settings.listening_profile_device) ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  return buildProfileBundle({ deviceName, platform, settings, cloud, starred, listening });
}

async function findTrackIds(db: SQLiteDatabase, identity: string): Promise<number[]> {
  const separator = identity.indexOf(':');
  const kind = identity.slice(0, separator);
  const hash = identity.slice(separator + 1);
  if (hash === '') return [];
  const column = kind === 'sha256' ? 'content_hash_sha256' : kind === 'file' ? 'file_hash' : null;
  if (!column) return [];
  return (await db.getAllAsync<{ id: number }>(`SELECT id FROM tracks WHERE ${column} = ? ORDER BY id`, [hash])).map((row) => row.id);
}

async function mergeSession(db: SQLiteDatabase, record: ProfileSessionRecord): Promise<boolean> {
  const stored = await db.getFirstAsync<{ record: string }>('SELECT record FROM profile_sessions WHERE device_id = ? AND session_id = ?', [record.device.device_id, record.session_id]);
  const previous: ProfileSessionRecord | null = stored ? JSON.parse(stored.record) : null;
  try {
    const next = mergeProfileRecord(previous, record);
    if (next === previous) return false;
    const day = new Date(next.started_at).toISOString().slice(0, 10);
    await db.runAsync(
      `INSERT INTO profile_sessions(device_id,session_id,day,version,record) VALUES (?,?,?,?,?)
       ON CONFLICT(device_id,session_id) DO UPDATE SET version=excluded.version,record=excluded.record`,
      [next.device.device_id, next.session_id, day, next.version, JSON.stringify(next)]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the profile part of a Profile import after its songs and playlists are in: settings and keys overwrite this
 * phone's, the R2 connection is saved, starred songs are starred, listening sessions are merged by the rule the sync uses.
 */
export async function applyMobileProfile(parsed: ParsedProfileBundle): Promise<void> {
  const { bundle } = parsed;
  // Writes go through the same serialized lane the cloud sync uses, so they never collide with a sync writing.
  await runMobileCloudDbLane((db) => db.withTransactionAsync(async () => {
    for (const [key, value] of Object.entries(bundle.settings)) await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    for (const identity of bundle.starred) {
      for (const id of await findTrackIds(db, identity)) await db.runAsync('UPDATE tracks SET rating = 1 WHERE id = ? AND COALESCE(rating, 0) = 0', [id]);
    }
    for (const record of bundle.listening) await mergeSession(db, record);
  }));


  if (bundle.cloud) await saveMobileCloudConfig(bundle.cloud);
}
