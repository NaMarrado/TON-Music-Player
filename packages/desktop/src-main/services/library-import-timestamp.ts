import type Database from 'better-sqlite3';
import type { getDb } from './database';

export function createMarkTrackImportedStatement(
  db: ReturnType<typeof getDb>,
): Database.Statement<[number, number]> {
  return db.prepare(`
    UPDATE tracks
    SET downloaded_at = CASE
      WHEN downloaded_at IS NULL OR downloaded_at <= 0 THEN ?
      ELSE downloaded_at
    END,
    in_library = 1
    WHERE id = ?
  `);
}

export function getCurrentImportTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
