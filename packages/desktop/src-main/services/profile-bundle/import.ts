import type Database from 'better-sqlite3';
import { mergeProfileRecord, type ParsedProfileBundle, type ProfileSessionRecord } from '@ton/core';
import { saveDesktopProfileRecord } from '../listening-profile/store';

export interface ProfileApplyResult {
  settings: number;
  starred: number;
  sessions: number;
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

function mergeSession(db: Database.Database, record: ProfileSessionRecord): boolean {
  const stored: unknown = db.prepare('SELECT record FROM profile_sessions WHERE device_id = ? AND session_id = ?').get(record.device.device_id, record.session_id);
  const text = typeof stored === 'object' && stored !== null && 'record' in stored && typeof stored.record === 'string' ? stored.record : null;
  const previous: ProfileSessionRecord | null = text ? JSON.parse(text) : null;
  try {
    const next = mergeProfileRecord(previous, record);
    if (next === previous) return false;
    saveDesktopProfileRecord(db, next);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the profile part of a Profile import after its songs and playlists are in: settings and keys overwrite this
 * device's, the starred songs are starred, listening sessions are merged by the rule the sync uses. The R2 connection is
 * saved by the caller, because encrypting its secret needs the running app.
 */
export function applyDesktopProfile(db: Database.Database, parsed: ParsedProfileBundle): ProfileApplyResult {
  const { bundle } = parsed;
  const result: ProfileApplyResult = { settings: 0, starred: 0, sessions: 0 };
  db.transaction(() => {
    const writeSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(bundle.settings)) {
      writeSetting.run(key, value);
      result.settings += 1;
    }
    const star = db.prepare('UPDATE tracks SET rating = 1 WHERE id = ? AND COALESCE(rating, 0) = 0');
    for (const identity of bundle.starred) for (const id of findTrackIds(db, identity)) result.starred += star.run(id).changes;
    for (const record of bundle.listening) if (mergeSession(db, record)) result.sessions += 1;
  })();
  return result;
}
