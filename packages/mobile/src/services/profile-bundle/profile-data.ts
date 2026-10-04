import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  buildProfileBundle,
  mergeProfileRecord,
  starIdentity,
  type ExportPlaylistEntry,
  type ParsedProfileBundle,
  type ProfileBundle,
  type ProfileBundlePlatform,
  type ProfileSessionRecord,
} from '@ton/core';
import { runMobileCloudDbLane } from '../cloud-sync/db-lane';
import { getMobileProfileDevice } from '../listening-profile/store';

export interface CollectedMobileProfile {
  bundle: ProfileBundle;
  /** Starred songs and playlist entries that have no hash and so cannot be recognised on another device. */
  unidentified: number;
}

export interface MobileProfileImportResult {
  settings: number;
  ignoredSettings: number;
  starred: number;
  starsMissing: number;
  playlistsCreated: number;
  playlistsSkipped: number;
  playlistTracksMissing: number;
  sessions: number;
  sessionsRejected: number;
}

interface TrackIdentityRow {
  id: number;
  content_hash_sha256: string | null;
  file_hash: string | null;
}

interface PlaylistRow {
  id: number;
  name: string;
  description: string | null;
  is_smart: number;
  smart_rules: string | null;
}

const platform: ProfileBundlePlatform = Platform.OS === 'ios' ? 'ios' : 'android';

/** Reads the settings, stars, playlists and listening history of this phone. Secrets are filtered by the shared builder. */
export async function collectMobileProfile(): Promise<CollectedMobileProfile> {
  const device = await getMobileProfileDevice();
  return runMobileCloudDbLane(async (db) => {
    const settings: Record<string, string> = {};
    for (const row of await db.getAllAsync<{ key: string; value: string | null }>('SELECT key, value FROM settings')) {
      if (row.value !== null) settings[row.key] = row.value;
    }
    const identityByTrackId: Record<number, string | null> = {};
    for (const track of await db.getAllAsync<TrackIdentityRow>('SELECT id, content_hash_sha256, file_hash FROM tracks')) {
      identityByTrackId[track.id] = starIdentity(track);
    }

    const starred: string[] = [];
    let unidentified = 0;
    for (const track of await db.getAllAsync<{ id: number }>('SELECT id FROM tracks WHERE COALESCE(rating, 0) > 0')) {
      const identity = identityByTrackId[track.id];
      if (identity) starred.push(identity);
      else unidentified += 1;
    }

    const playlists: ExportPlaylistEntry[] = [];
    for (const playlist of await db.getAllAsync<PlaylistRow>('SELECT id, name, description, is_smart, smart_rules FROM playlists ORDER BY sort_order, id')) {
      const hashes: string[] = [];
      for (const member of await db.getAllAsync<{ track_id: number }>('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position, id', [playlist.id])) {
        const identity = identityByTrackId[member.track_id];
        if (identity) hashes.push(identity);
        else unidentified += 1;
      }
      playlists.push({ name: playlist.name, description: playlist.description, is_smart: playlist.is_smart === 1, smart_rules: playlist.smart_rules, track_hashes: hashes });
    }

    const listening: ProfileSessionRecord[] = [];
    for (const row of await db.getAllAsync<{ record: string }>('SELECT record FROM profile_sessions')) listening.push(JSON.parse(row.record));

    return { bundle: buildProfileBundle({ deviceName: device.name, platform, settings, starred, playlists, listening }), unidentified };
  });
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

async function mergeSession(db: SQLiteDatabase, record: ProfileSessionRecord): Promise<'added' | 'same' | 'rejected'> {
  const stored = await db.getFirstAsync<{ record: string }>('SELECT record FROM profile_sessions WHERE device_id = ? AND session_id = ?', [record.device.device_id, record.session_id]);
  const previous: ProfileSessionRecord | null = stored ? JSON.parse(stored.record) : null;
  try {
    const next = mergeProfileRecord(previous, record);
    if (next === previous) return 'same';
    const day = new Date(next.started_at).toISOString().slice(0, 10);
    await db.runAsync(
      `INSERT INTO profile_sessions(device_id,session_id,day,version,record) VALUES (?,?,?,?,?)
       ON CONFLICT(device_id,session_id) DO UPDATE SET version=excluded.version,record=excluded.record`,
      [next.device.device_id, next.session_id, day, next.version, JSON.stringify(next)]);
    return 'added';
  } catch {
    return 'rejected';
  }
}

/** Merges a profile into this phone's database. Nothing is removed; secrets and device settings are never touched. */
export function applyMobileProfile(parsed: ParsedProfileBundle): Promise<MobileProfileImportResult> {
  const { bundle } = parsed;
  return runMobileCloudDbLane(async (db) => {
    const result: MobileProfileImportResult = {
      settings: 0, ignoredSettings: parsed.ignoredSettings.length, starred: 0, starsMissing: 0,
      playlistsCreated: 0, playlistsSkipped: 0, playlistTracksMissing: 0, sessions: 0, sessionsRejected: 0,
    };
    await db.withTransactionAsync(async () => {
      for (const [key, value] of Object.entries(bundle.settings)) {
        await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
        result.settings += 1;
      }

      for (const identity of bundle.starred) {
        const ids = await findTrackIds(db, identity);
        if (ids.length === 0) result.starsMissing += 1;
        for (const id of ids) result.starred += (await db.runAsync('UPDATE tracks SET rating = 1 WHERE id = ? AND COALESCE(rating, 0) = 0', [id])).changes;
      }

      const existing = new Set((await db.getAllAsync<{ name: string }>('SELECT name FROM playlists')).map((row) => row.name.trim().toLowerCase()));
      for (const playlist of bundle.playlists) {
        const name = playlist.name.trim().toLowerCase();
        if (existing.has(name)) {
          result.playlistsSkipped += 1;
          continue;
        }
        existing.add(name);
        const created = await db.runAsync('INSERT INTO playlists (name, description, is_smart, smart_rules) VALUES (?, ?, ?, ?)', [playlist.name, playlist.description, playlist.is_smart ? 1 : 0, playlist.smart_rules]);
        let position = 0;
        for (const identity of playlist.track_hashes) {
          const [trackId] = await findTrackIds(db, identity);
          if (trackId === undefined) {
            result.playlistTracksMissing += 1;
            continue;
          }
          await db.runAsync('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)', [created.lastInsertRowId, trackId, position]);
          position += 1;
        }
        result.playlistsCreated += 1;
      }

      for (const record of bundle.listening) {
        const outcome = await mergeSession(db, record);
        if (outcome === 'added') result.sessions += 1;
        else if (outcome === 'rejected') result.sessionsRejected += 1;
      }
    });
    return result;
  });
}
