/**
 * Every expo-sqlite call, on every connection, runs on one native thread. A statement that sleeps in SQLite's busy
 * handler waiting for another connection's lock therefore blocks that connection too: its next statement (the COMMIT
 * that would release the lock) is queued behind the sleeper. Busy waits would freeze all database work and then fail
 * with "database is locked". So app connections use busy_timeout = 0, and a locked statement is retried from
 * JavaScript, which leaves the thread free for the lock holder between attempts.
 */
const LOCK_RETRY_FIRST_DELAY_MS = 10;
const LOCK_RETRY_MAX_DELAY_MS = 200;
const LOCK_RETRY_GIVE_UP_MS = 60_000;

/** Only a lock held by another connection clears by waiting; other errors (SQLITE_LOCKED included) are rethrown. */
function isDatabaseLockedError(error: unknown): boolean {
  return /database is locked|SQLITE_BUSY/i.test(String(error));
}

export async function retryWhileDatabaseLocked<T>(
  run: () => Promise<T>,
  giveUpAfterMs = LOCK_RETRY_GIVE_UP_MS,
): Promise<T> {
  const startedAt = Date.now();
  for (let delay = LOCK_RETRY_FIRST_DELAY_MS; ; delay = Math.min(delay * 2, LOCK_RETRY_MAX_DELAY_MS)) {
    try {
      return await run();
    } catch (error) {
      if (!isDatabaseLockedError(error) || Date.now() - startedAt >= giveUpAfterMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
