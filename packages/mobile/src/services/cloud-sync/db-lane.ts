import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { retryWhileDatabaseLocked } from '../database-lock-retry';

let cloudDbTail: Promise<void> = Promise.resolve();
let cloudDbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Opens an app connection whose statements never sleep in the busy handler: they fail at once when another
 * connection holds the lock and are retried with retryWhileDatabaseLocked. Transactions start with BEGIN IMMEDIATE,
 * so a transaction takes the write lock before its first statement instead of failing halfway through.
 */
export async function openAppDatabase(options?: Parameters<typeof openDatabaseAsync>[1]): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync('ton.db', options);
  await database.execAsync('PRAGMA busy_timeout = 0');
  await retryWhileDatabaseLocked(() => database.execAsync('PRAGMA journal_mode = WAL'));
  await database.execAsync('PRAGMA foreign_keys = ON');
  const runAsync = database.runAsync.bind(database);
  const execAsync = database.execAsync.bind(database);
  const getAllAsync = database.getAllAsync.bind(database);
  const getFirstAsync = database.getFirstAsync.bind(database);
  return Object.assign(database, {
    runAsync: ((...args: Parameters<typeof runAsync>) => retryWhileDatabaseLocked(() => runAsync(...args))) as typeof runAsync,
    execAsync: ((source: string) => retryWhileDatabaseLocked(() => execAsync(source))) as typeof execAsync,
    getAllAsync: ((...args: Parameters<typeof getAllAsync>) => retryWhileDatabaseLocked(() => getAllAsync(...args))) as typeof getAllAsync,
    getFirstAsync: ((...args: Parameters<typeof getFirstAsync>) => retryWhileDatabaseLocked(() => getFirstAsync(...args))) as typeof getFirstAsync,
    withTransactionAsync: ((task: () => Promise<void>) => runInWriteTransaction(database, () => task())) as SQLiteDatabase['withTransactionAsync'],
  });
}

export function getMobileCloudDb(): Promise<SQLiteDatabase> {
  if (!cloudDbPromise) {
    cloudDbPromise = openAppDatabase({
      useNewConnection: true,
      finalizeUnusedStatementsBeforeClosing: false,
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

/** Runs `run` in a write transaction on a connection the caller already owns. */
export async function runInWriteTransaction<T>(
  database: SQLiteDatabase,
  run: (database: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await run(database);
    await database.execAsync('COMMIT');
    return result;
  } catch (error) {
    await database.execAsync('ROLLBACK').catch(() => {});
    throw error;
  }
}

/**
 * Write transaction on the serialized second connection, isolated from the app's shared connection (expo-sqlite's
 * withExclusiveTransactionAsync opened a fresh connection per call). Never call this from inside
 * runMobileCloudDbLane, and never write through getDb() inside it: the lane is not re-entrant, and the shared
 * connection would wait for this transaction's lock while the transaction waits for it.
 */
export function runMobileCloudDbTransaction<T>(
  run: (database: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  return runMobileCloudDbLane((database) => runInWriteTransaction(database, run));
}
