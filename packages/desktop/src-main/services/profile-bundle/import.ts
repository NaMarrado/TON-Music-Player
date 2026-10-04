import type Database from 'better-sqlite3';
import { mergeProfileRecord, type ParsedProfileBundle, type ProfileSessionRecord } from '@ton/core';
import { saveDesktopProfileRecord } from '../listening-profile/store';

export interface ProfileImportResult {
  /** Settings written. */
  settings: number;
  /** Settings in the file that were refused (secret, unknown or invalid). */
  ignoredSettings: number;
  /** Songs newly starred. */
  starred: number;
  /** Starred songs this library does not contain. */
  starsMissing: number;
  playlistsCreated: number;
  /** Playlists left alone because one with that name already exists. */
  playlistsSkipped: number;
  /** Playlist entries whose song this library does not contain. */
  playlistTracksMissing: number;
  /** Listening sessions added or brought up to date. */
  sessions: number;
  /** Listening sessions refused because they contradict what is already stored. */
  sessionsRejected: number;
}

function findTrackIds(db: Database.Database, identity: string): number[] {
  const separator = identity.indexOf(':');
  const kind = identity.slice(0, separator);
  const hash = identity.slice(separator + 1);
  if (hash === '') return [];
  const found: unknown = kind === 'sha256'
    ? db.prepare('SELECT id FROM tracks WHERE content_hash_sha256 = ? ORDER BY id').all(hash)
    : kind === 'file'
      ? db.prepare('SELECT id FROM tracks WHERE file_hash = ? ORDER BY id').all(hash)
      : [];
  return (found as Array<{ id: number }>).map((row) => row.id);
}

function mergeSession(db: Database.Database, record: ProfileSessionRecord): 'added' | 'same' | 'rejected' {
  const stored: unknown = db.prepare('SELECT record FROM profile_sessions WHERE device_id = ? AND session_id = ?').get(record.device.device_id, record.session_id);
  const previous: ProfileSessionRecord | null = stored ? JSON.parse((stored as { record: string }).record) : null;
  try {
    const next = mergeProfileRecord(previous, record);
    if (next === previous) return 'same';
    saveDesktopProfileRecord(db, next);
    return 'added';
  } catch {
    return 'rejected';
  }
}

/**
 * Merges a profile into this database. Nothing is ever removed. Settings come only from the shared allowlist (the parser
 * already dropped everything else), stars are only added, playlists are only created, listening sessions are merged by
 * the same rule the sync uses.
 */
export function applyDesktopProfile(db: Database.Database, parsed: ParsedProfileBundle): ProfileImportResult {
  const { bundle } = parsed;
  const result: ProfileImportResult = {
    settings: 0, ignoredSettings: parsed.ignoredSettings.length, starred: 0, starsMissing: 0,
    playlistsCreated: 0, playlistsSkipped: 0, playlistTracksMissing: 0, sessions: 0, sessionsRejected: 0,
  };

  db.transaction(() => {
    const writeSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(bundle.settings)) {
      writeSetting.run(key, value);
      result.settings += 1;
    }

    const star = db.prepare('UPDATE tracks SET rating = 1 WHERE id = ? AND COALESCE(rating, 0) = 0');
    for (const identity of bundle.starred) {
      const ids = findTrackIds(db, identity);
      if (ids.length === 0) result.starsMissing += 1;
      for (const id of ids) result.starred += star.run(id).changes;
    }

    const existingNames = new Set((db.prepare('SELECT name FROM playlists').all() as Array<{ name: string }>).map((row) => row.name.trim().toLowerCase()));
    const createPlaylist = db.prepare('INSERT INTO playlists (name, description, is_smart, smart_rules) VALUES (?, ?, ?, ?)');
    const addMember = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
    for (const playlist of bundle.playlists) {
      const name = playlist.name.trim().toLowerCase();
      if (existingNames.has(name)) {
        result.playlistsSkipped += 1;
        continue;
      }
      existingNames.add(name);
      const playlistId = Number(createPlaylist.run(playlist.name, playlist.description, playlist.is_smart ? 1 : 0, playlist.smart_rules).lastInsertRowid);
      let position = 0;
      for (const identity of playlist.track_hashes) {
        const [trackId] = findTrackIds(db, identity);
        if (trackId === undefined) {
          result.playlistTracksMissing += 1;
          continue;
        }
        addMember.run(playlistId, trackId, position);
        position += 1;
      }
      result.playlistsCreated += 1;
    }

    for (const record of bundle.listening) {
      const outcome = mergeSession(db, record);
      if (outcome === 'added') result.sessions += 1;
      else if (outcome === 'rejected') result.sessionsRejected += 1;
    }
  })();

  return result;
}
