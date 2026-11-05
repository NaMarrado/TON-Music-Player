import type { SQLiteDatabase } from 'expo-sqlite';
import { PERSISTED_SETTING_DEFAULTS } from '@ton/core';
import { runMigrations } from './migrations';
import { openAppDatabase, runInWriteTransaction } from './cloud-sync/db-lane';

let db: SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export async function initDatabase(): Promise<void> {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const database = await openAppDatabase();
      await runMigrations(database);
      await seedDefaults(database);
      db = database;
    } catch (e) {
      initPromise = null;
      throw e;
    }
  })();

  return initPromise;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    initPromise = null;
  }
}

async function seedDefaults(database: SQLiteDatabase): Promise<void> {
  await runInWriteTransaction(database, async (txn) => {
    for (const [key, value] of Object.entries(PERSISTED_SETTING_DEFAULTS)) {
      await txn.runAsync(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [key, String(value)],
      );
    }
  });
}
