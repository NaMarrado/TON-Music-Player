import type Database from 'better-sqlite3';
import { buildProfileAnalytics } from '@ton/core';
import type {
  ListeningProfileSummary,
  ListeningSessionSnapshot,
  ProfileHistoryEntry,
  ProfileQuery,
  ProfileSessionRecord,
  Track,
} from '@ton/core';
import {
  backfillDesktopProfileRecords,
  findDesktopProfileTracks,
  getDesktopProfileDevice,
  notifyDesktopProfileChanges,
  readDesktopProfileRecords,
  recordDesktopProfileSnapshot,
} from '../services/listening-profile/store';

const TOTAL_KEY = 'listening_profile_total_ms';
const STARTED_KEY = 'listening_profile_started_at';
const ACTIVE_KEY = 'listening_profile_active_session';

type HistoryRow = {
  session_id: string;
  track_id: number;
  played_at: number;
  listened_ms: number;
  completed: number;
  ended_at: number | null;
};

export function recordListeningSession(
  db: Database.Database,
  snapshot: ListeningSessionSnapshot,
): void {
  if (!snapshot || typeof snapshot.session_id !== 'string'
    || !snapshot.session_id.length || snapshot.session_id.length > 128
    || !Number.isSafeInteger(snapshot.track_id) || snapshot.track_id <= 0
    || !Number.isSafeInteger(snapshot.started_at) || snapshot.started_at <= 0
    || !Number.isSafeInteger(snapshot.listened_ms) || snapshot.listened_ms < 0
    || typeof snapshot.completed !== 'boolean'
    || (snapshot.ended_at !== null && (!Number.isSafeInteger(snapshot.ended_at)
      || snapshot.ended_at < snapshot.started_at))) {
    throw new Error('Invalid listening session');
  }

  let profileChanged = false;
  db.transaction(() => {
    const previous = db.prepare('SELECT * FROM play_history WHERE session_id = ?')
      .get(snapshot.session_id) as HistoryRow | undefined;
    if (previous && (previous.track_id !== snapshot.track_id
      || previous.played_at !== snapshot.started_at)) {
      throw new Error('Listening session identity cannot change');
    }
    profileChanged = recordDesktopProfileSnapshot(db, snapshot).changed;
    // A late periodic write may arrive after the terminal flush. It cannot reopen
    // the session, add time, or increment its play count again.
    if (previous?.ended_at != null) return;
    if (!db.prepare('SELECT id FROM tracks WHERE id = ?').get(snapshot.track_id)) return;
    if (!snapshot.listened_ms && !previous) return;

    const listenedMs = Math.max(previous?.listened_ms ?? 0, snapshot.listened_ms);
    const delta = listenedMs - (previous?.listened_ms ?? 0);
    db.prepare(`
      INSERT INTO play_history (session_id, track_id, played_at, listened_ms, completed, ended_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        listened_ms = excluded.listened_ms,
        completed = MAX(play_history.completed, excluded.completed),
        ended_at = excluded.ended_at
    `).run(
      snapshot.session_id, snapshot.track_id, snapshot.started_at, listenedMs,
      snapshot.completed ? 1 : 0, snapshot.ended_at,
    );

    if (delta > 0) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .run(STARTED_KEY, String(snapshot.started_at));
      db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = CAST(settings.value AS INTEGER) + excluded.value
      `).run(TOTAL_KEY, String(delta));
      if (!previous || previous.listened_ms === 0) {
        db.prepare(`
          UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE id = ?
        `).run(snapshot.started_at, snapshot.track_id);
      }
    }

    if (snapshot.ended_at == null) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run(ACTIVE_KEY, snapshot.session_id);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ? AND value = ?')
        .run(ACTIVE_KEY, snapshot.session_id);
    }
  })();
  if (profileChanged) notifyDesktopProfileChanges();
}

export function getListeningProfileSummary(
  db: Database.Database,
  query: ProfileQuery = { period: 'month' },
  now = Date.now(),
): ListeningProfileSummary {
  backfillDesktopProfileRecords(db);
  const started = db.prepare('SELECT value FROM settings WHERE key = ?')
    .get(STARTED_KEY) as { value: string } | undefined;
  const total = db.prepare('SELECT value FROM settings WHERE key = ?')
    .get(TOTAL_KEY) as { value: string } | undefined;
  const favorites = db.prepare(`
    SELECT * FROM tracks WHERE rating > 0 ORDER BY title COLLATE NOCASE, artist COLLATE NOCASE, id
  `).all() as Track[];
  const mostPlayed = db.prepare(`
    SELECT * FROM tracks WHERE play_count > 0 ORDER BY play_count DESC, last_played_at DESC, id
  `).all() as Track[];
  const histories = db.prepare(`
    SELECT session_id, track_id, played_at, listened_ms, completed, ended_at
    FROM play_history WHERE session_id IS NOT NULL AND listened_ms > 0
    ORDER BY played_at DESC, id DESC LIMIT 30
  `).all() as HistoryRow[];
  const historyTrackIds = [...new Set(histories.map((entry) => entry.track_id))];
  const historyTracks = historyTrackIds.length
    ? db.prepare(`SELECT * FROM tracks WHERE id IN (${historyTrackIds.map(() => '?').join(',')})`)
      .all(...historyTrackIds) as Track[]
    : [];
  const trackMap = new Map(historyTracks.map((track) => [track.id, track]));
  const recent: ProfileHistoryEntry[] = [];
  for (const entry of histories) {
    const track = trackMap.get(entry.track_id);
    if (!track) continue;
    recent.push({
      session_id: entry.session_id,
      played_at: entry.played_at,
      listened_ms: entry.listened_ms,
      completed: Boolean(entry.completed),
      ended_at: entry.ended_at,
      track,
    });
  }
  const plays = db.prepare('SELECT COALESCE(SUM(play_count), 0) AS count FROM tracks')
    .get() as { count: number };
  const device = getDesktopProfileDevice(db);
  const records = readDesktopProfileRecords(db);
  const analytics = buildProfileAnalytics(records, findDesktopProfileTracks(db, records, device.device_id), device.device_id, query, now);
  return {
    analytics,
    total_listened_ms: Number(total?.value ?? 0),
    measurement_started_at: Number(started?.value ?? 0),
    total_plays: plays.count,
    favorite_count: favorites.length,
    favorites,
    most_played: mostPlayed,
    recent,
  };
}

export function getActiveListeningSession(
  db: Database.Database,
  trackId: number,
): ListeningSessionSnapshot | null {
  const row = db.prepare(`
    SELECT h.* FROM play_history h
    JOIN settings s ON s.key = ? AND s.value = h.session_id
    WHERE h.track_id = ? AND h.ended_at IS NULL
  `).get(ACTIVE_KEY, trackId) as HistoryRow | undefined;
  if (!row) return null;
  const device = getDesktopProfileDevice(db);
  const stored = db.prepare('SELECT record FROM profile_sessions WHERE device_id = ? AND session_id = ?')
    .get(device.device_id, row.session_id) as { record: string } | undefined;
  const record = stored ? JSON.parse(stored.record) as ProfileSessionRecord : null;
  return {
    session_id: row.session_id,
    track_id: row.track_id,
    started_at: row.played_at,
    listened_ms: row.listened_ms,
    completed: Boolean(row.completed),
    ended_at: null,
    ...(record ? { device, intervals: record.intervals, observations: record.observations } : {}),
  };
}
