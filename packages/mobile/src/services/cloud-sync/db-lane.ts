import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const SQLITE_BUSY_TIMEOUT_MS = 5_000;

let cloudDbTail: Promise<void> = Promise.resolve();
let cloudDbPromise: Promise<SQLiteDatabase> | null = null;

export function getMobileCloudDb(): Promise<SQLiteDatabase> {
  if (!cloudDbPromise) {
    cloudDbPromise = openDatabaseAsync('ton.db', {
      useNewConnection: true,
      finalizeUnusedStatementsBeforeClosing: false,
    }).then(async (database) => {
      await database.execAsync('PRAGMA journal_mode = WAL');
      await database.execAsync(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      await database.execAsync('PRAGMA foreign_keys = ON');
      return database;
    }).catch((error) => {
      cloudDbPromise = null;
      throw error;
    });
  }
  return cloudDbPromise;
}

export async function runMobileCloudDbLane<T>(
  run: (database: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const previous = cloudDbTail;
  let release!: () => void;
  cloudDbTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await run(await getMobileCloudDb());
  } finally {
    release();
  }
}
