import os from 'node:os';
import type Database from 'better-sqlite3';
import { buildProfileBundle, starIdentity, type CloudStorageConfig, type ProfileBundle } from '@ton/core';
import { readDesktopProfileRecords } from '../listening-profile/store';

function rows<T>(db: Database.Database, sql: string): T[] {
  const found: unknown = db.prepare(sql).all();
  // The columns are the ones the statement selects, so the shape is fixed by the statement itself.
  return found as T[];
}

/**
 * Reads the profile part of a Profile export from this device: settings and keys, the R2 connection (handed in already
 * decrypted, because decryption needs the running app), stars and listening history. Device-bound settings are dropped by
 * the shared builder.
 */
export function collectDesktopProfile(
  db: Database.Database,
  options: { cloud: CloudStorageConfig | null; deviceName?: string; now?: number },
): ProfileBundle {
  const settings: Record<string, string> = {};
  for (const row of rows<{ key: string; value: string | null }>(db, 'SELECT key, value FROM settings')) if (row.value !== null) settings[row.key] = row.value;

  const starred: string[] = [];
  for (const track of rows<{ content_hash_sha256: string | null; file_hash: string | null }>(db, 'SELECT content_hash_sha256, file_hash FROM tracks WHERE COALESCE(rating, 0) > 0')) {
    const identity = starIdentity(track);
    if (identity) starred.push(identity);
  }

  return buildProfileBundle({
    deviceName: options.deviceName ?? os.hostname(),
    platform: 'desktop',
    settings,
    cloud: options.cloud,
    starred,
    listening: readDesktopProfileRecords(db),
  }, options.now);
}
