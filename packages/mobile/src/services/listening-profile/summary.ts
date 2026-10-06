import { buildProfileAnalytics, type ProfileAnalytics, type ProfileQuery, type ProfileSessionRecord, type Track } from '@ton/core';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMobileCloudDbLane } from '../cloud-sync/db-lane';
import { getMobileProfileDevice } from './store';

export interface MobileProfileSummary {
  analytics: ProfileAnalytics;
  favorites: Track[];
}

const IDENTITY_COLUMNS: Record<string, string> = {
  sha256: 'content_hash_sha256',
  youtube: 'youtube_id',
  spotify: 'spotify_id',
  soundcloud: 'soundcloud_id',
  file: 'file_hash',
};
const CHUNK = 500;

async function selectIn(db: SQLiteDatabase, column: string, values: (string | number)[], found: Map<number, Track>): Promise<void> {
  for (let index = 0; index < values.length; index += CHUNK) {
    const chunk = values.slice(index, index + CHUNK);
    const rows = await db.getAllAsync<Track>(`SELECT * FROM tracks WHERE ${column} IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const track of rows) found.set(track.id, track);
  }
}

/** Library tracks behind the records: this phone's by id, every device's by song identity (same lookup as the desktop). */
async function findProfileTracks(db: SQLiteDatabase, records: ProfileSessionRecord[], deviceId: string): Promise<Track[]> {
  const found = new Map<number, Track>();
  const ids = [...new Set(records.flatMap((record) => (
    record.device.device_id === deviceId && record.track_id != null ? [record.track_id] : []
  )))];
  await selectIn(db, 'id', ids, found);
  const grouped = new Map<string, Set<string>>();
  for (const record of records) {
    const [kind, ...rest] = record.identity.split(':');
    if (!IDENTITY_COLUMNS[kind] || rest.length === 0) continue;
    const values = grouped.get(kind) ?? new Set<string>();
    values.add(rest.join(':'));
    grouped.set(kind, values);
  }
  for (const [kind, values] of grouped) await selectIn(db, IDENTITY_COLUMNS[kind], [...values], found);
  return [...found.values()];
}

/** Statistics for the Profile screen from every device's records stored on this phone. */
export async function getMobileProfileSummary(query: ProfileQuery): Promise<MobileProfileSummary> {
  const device = await getMobileProfileDevice();
  return runMobileCloudDbLane(async (db) => {
    const records = (await db.getAllAsync<{ record: string }>('SELECT record FROM profile_sessions'))
      .map((row) => JSON.parse(row.record) as ProfileSessionRecord);
    const tracks = await findProfileTracks(db, records, device.device_id);
    const favorites = await db.getAllAsync<Track>(
      'SELECT * FROM tracks WHERE rating > 0 ORDER BY title COLLATE NOCASE, artist COLLATE NOCASE, id');
    return { analytics: buildProfileAnalytics(records, tracks, device.device_id, query), favorites };
  });
}
