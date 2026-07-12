import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate001 } from './001-initial-schema';
import { migrate002 } from './002-performance-indexes';
import { migrate003 } from './003-cloud-sync';
import { migrate004 } from './004-download-notification-ledger';
import { migrate005 } from './005-playlist-imports';

interface Migration {
  version: number;
  run: (db: SQLiteDatabase) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  { version: 1, run: migrate001 },
  { version: 2, run: migrate002 },
  { version: 3, run: migrate003 },
  { version: 4, run: migrate004 },
  { version: 5, run: migrate005 },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      await db.withTransactionAsync(async () => {
        await migration.run(db);
      });
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    }
  }
}
