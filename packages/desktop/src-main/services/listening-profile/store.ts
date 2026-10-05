import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type Database from 'better-sqlite3';
import { createProfileRecord, mergeProfileRecord, profileRecordDay, updateProfileRecord, validateProfileObservation,
  type ListeningSessionSnapshot, type PlaybackObservation, type ProfileDevice, type ProfileSessionRecord, type Track } from '@ton/core';
import { getDb } from '../database/connection';

const DEVICE_KEY = 'listening_profile_device';
const subscribers = new Set<() => void>();
export function subscribeDesktopProfileChanges(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
export function notifyDesktopProfileChanges(): void {
  for (const listener of subscribers) listener();
}
export function getDesktopProfileDevice(db: Database.Database = getDb()): ProfileDevice {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get(DEVICE_KEY) as { value: string } | undefined;
  if (stored) return JSON.parse(stored.value) as ProfileDevice;
  const platform: ProfileDevice['platform'] = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'unknown';
  const device: ProfileDevice = { device_id: randomUUID(), name: hostname(), platform };
  db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run(DEVICE_KEY, JSON.stringify(device));
  return device;
}
export function readDesktopProfileRecords(db: Database.Database = getDb(), deviceId?: string, day?: string): ProfileSessionRecord[] {
  const where = deviceId ? ` WHERE device_id = ?${day ? ' AND day = ?' : ''}` : '';
  const args = deviceId ? day ? [deviceId, day] : [deviceId] : [];
  return (db.prepare(`SELECT record FROM profile_sessions${where}`).all(...args) as { record: string }[]).map((row) => JSON.parse(row.record) as ProfileSessionRecord);
}
export function saveDesktopProfileRecord(db: Database.Database, record: ProfileSessionRecord): void {
  db.prepare(`INSERT INTO profile_sessions(device_id,session_id,day,version,record) VALUES (?,?,?,?,?)
    ON CONFLICT(device_id,session_id) DO UPDATE SET version=excluded.version,record=excluded.record`).run(
    record.device.device_id, record.session_id, profileRecordDay(record), record.version, JSON.stringify(record));
}
export function recordDesktopProfileSnapshot(db: Database.Database, snapshot: ListeningSessionSnapshot): { changed: boolean; delta: number; first: boolean } {
  const device = getDesktopProfileDevice(db);
  if (snapshot.device && snapshot.device.device_id !== device.device_id) throw new Error('Invalid local profile device');
  const row = db.prepare('SELECT record FROM profile_sessions WHERE device_id=? AND session_id=?').get(device.device_id, snapshot.session_id) as { record: string } | undefined;
  const old = row ? JSON.parse(row.record) as ProfileSessionRecord : null;
  const track = db.prepare('SELECT * FROM tracks WHERE id=?').get(snapshot.track_id) as Track | undefined;
  if (!old && (!track || snapshot.listened_ms === 0)) return { changed: false, delta: 0, first: false };
  const base = old ?? createProfileRecord(snapshot, track!, device);
  const next = updateProfileRecord(base, snapshot);
  if (next === base && old) return { changed: false, delta: 0, first: false };
  saveDesktopProfileRecord(db, next);
  return { changed: true, delta: next.listened_ms - (old?.listened_ms ?? 0), first: !old };
}
export function recordDesktopProfileEvents(db: Database.Database, events: PlaybackObservation[]): void {
  if (!Array.isArray(events) || events.length > 5000) throw new Error('Invalid profile events');
  const device = getDesktopProfileDevice(db);
  let changed = false;
  db.transaction(() => {
    for (const event of events) {
      validateProfileObservation(event, device.device_id);
      const row = db.prepare('SELECT record FROM profile_sessions WHERE device_id=? AND session_id=?').get(device.device_id, event.session_id) as { record: string } | undefined;
      if (!row) throw new Error('Unknown profile session');
      const record = JSON.parse(row.record) as ProfileSessionRecord;
      const old = record.observations.find((value) => value.event_id === event.event_id);
      if (old) { if (JSON.stringify(old) !== JSON.stringify(event)) throw new Error('Profile observation is immutable'); continue; }
      if (record.track_id !== event.track_id) throw new Error('Profile event track mismatch');
      record.observations.push(event); record.version += 1;
      record.observations.sort((a, b) => a.at - b.at || a.event_id.localeCompare(b.event_id));
      saveDesktopProfileRecord(db, record); changed = true;
    }
  })();
  if (changed) notifyDesktopProfileChanges();
}
export function importDesktopProfileRecords(db: Database.Database, records: ProfileSessionRecord[], foreignDevice: string): void {
  if (foreignDevice === getDesktopProfileDevice(db).device_id) return;
  db.transaction(() => {
    for (const record of records) {
      if (record.device.device_id !== foreignDevice) throw new Error('Foreign profile device mismatch');
      const row = db.prepare('SELECT record FROM profile_sessions WHERE device_id=? AND session_id=?').get(foreignDevice, record.session_id) as { record: string } | undefined;
      const previous = row ? JSON.parse(row.record) as ProfileSessionRecord : null;
      const next = mergeProfileRecord(previous, record);
      if (next !== previous) saveDesktopProfileRecord(db, next);
    }
  })();
}
export function getPendingDesktopProfileCount(scopeId: string, db: Database.Database = getDb()): number {
  const deviceId = getDesktopProfileDevice(db).device_id;
  const rows = db.prepare('SELECT day,SUM(version) AS version FROM profile_sessions WHERE device_id=? GROUP BY day').all(deviceId) as { day: string; version: number }[];
  let pending = 0;
  for (const row of rows) {
    const cached = db.prepare('SELECT value FROM profile_sync_cache WHERE key=?').get(`${scopeId}:published:${row.day}`) as { value: string } | undefined;
    if (Number(cached?.value ?? 0) !== row.version) pending += 1;
  }
  return pending;
}

const BACKFILL_KEY = 'listening_profile_backfilled';
/** Measured legacy sessions become interval-less records; no device or setting history is invented. */
export function backfillDesktopProfileRecords(db: Database.Database): void {
  if (db.prepare('SELECT 1 FROM settings WHERE key=?').get(BACKFILL_KEY)) return;
  const device = getDesktopProfileDevice(db);
  db.transaction(() => {
    const rows = db.prepare(`SELECT session_id,track_id,played_at,listened_ms,completed,ended_at FROM play_history
      WHERE session_id IS NOT NULL AND listened_ms > 0 ORDER BY played_at`).all() as {
      session_id: string; track_id: number; played_at: number; listened_ms: number; completed: number; ended_at: number | null }[];
    const exists = db.prepare('SELECT 1 FROM profile_sessions WHERE device_id=? AND session_id=?');
    const find = db.prepare('SELECT * FROM tracks WHERE id=?');
    for (const row of rows) {
      if (exists.get(device.device_id, row.session_id)) continue;
      const track = find.get(row.track_id) as Track | undefined;
      if (!track) continue;
      const snapshot: ListeningSessionSnapshot = { session_id: row.session_id, track_id: row.track_id, started_at: row.played_at,
        listened_ms: row.listened_ms, completed: Boolean(row.completed), ended_at: row.ended_at };
      saveDesktopProfileRecord(db, updateProfileRecord(createProfileRecord(snapshot, track, device), snapshot));
    }
    db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run(BACKFILL_KEY, '1');
  })();
}

/** Playable tracks for records: same-device local ids plus cross-device stable identities. */
export function findDesktopProfileTracks(db: Database.Database, records: ProfileSessionRecord[], deviceId: string): Track[] {
  const found = new Map<number, Track>();
  const ids = [...new Set(records.filter((r) => r.device.device_id === deviceId && r.track_id != null).map((r) => r.track_id as number))];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const t of db.prepare(`SELECT * FROM tracks WHERE id IN (${chunk.map(() => '?').join(',')})`).all(...chunk) as Track[]) found.set(t.id, t);
  }
  const columns: Record<string, string> = { sha256: 'content_hash_sha256', youtube: 'youtube_id', spotify: 'spotify_id', soundcloud: 'soundcloud_id', file: 'file_hash' };
  const grouped = new Map<string, string[]>();
  for (const record of records) {
    const [kind, ...rest] = record.identity.split(':');
    if (!columns[kind] || !rest.length) continue;
    (grouped.get(kind) ?? grouped.set(kind, []).get(kind)!).push(rest.join(':'));
  }
  for (const [kind, values] of grouped) {
    const unique = [...new Set(values)];
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      for (const t of db.prepare(`SELECT * FROM tracks WHERE ${columns[kind]} IN (${chunk.map(() => '?').join(',')})`).all(...chunk) as Track[]) found.set(t.id, t);
    }
  }
  return [...found.values()];
}
