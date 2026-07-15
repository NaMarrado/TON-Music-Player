import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate001 } from './001-initial-schema';
import { migrate002 } from './002-performance-indexes';
import { migrate003 } from './003-cloud-sync';
import { migrate004 } from './004-download-notification-ledger';
import { migrate005 } from './005-playlist-imports';
import { migrate006 } from './006-download-quality';
import { migrate007 } from './007-canonical-library';
import { migrate008 } from './008-downloaded-at';
import { migrate009 } from './009-cloud-auto-sync';
import { migrate010 } from './010-cloud-v2-activation';
import { migrate011 } from './011-schema-drift-repair';

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
  { version: 6, run: migrate006 },
  { version: 7, run: migrate007 },
  { version: 8, run: migrate008 },
  { version: 9, run: migrate009 },
  { version: 10, run: migrate010 },
  { version: 11, run: migrate011 },
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
