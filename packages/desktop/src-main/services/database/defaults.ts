import type Database from 'better-sqlite3';
import { PERSISTED_SETTING_DEFAULTS } from '@ton/core';

export function seedDefaults(db: Database.Database): void {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const insertAll = db.transaction(() => {
    for (const [key, value] of Object.entries(PERSISTED_SETTING_DEFAULTS)) {
      insert.run(key, String(value));
    }
  });

  insertAll();
}
