import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { retryWhileDatabaseLocked } from '../../packages/mobile/src/services/database-lock-retry.ts';

// Like expo-sqlite, both connections live on one thread here: while one statement sleeps in SQLite's busy handler,
// nothing else (including the lock holder's COMMIT) can run. Real timers are the point: the tests prove whether the
// holder's scheduled COMMIT can run while the other connection waits, which fake timers cannot show.
function openPair(busyTimeoutMs: number) {
  const dir = mkdtempSync(join(tmpdir(), 'ton-lock-'));
  const path = join(dir, 'ton.db');
  const holder = new Database(path);
  holder.pragma('journal_mode = WAL');
  holder.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  const writer = new Database(path);
  writer.pragma(`busy_timeout = ${busyTimeoutMs}`);
  return {
    holder,
    writer,
    close: () => { holder.close(); writer.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

test('a busy wait on the shared thread cannot outlast the lock holder and ends in "database is locked"', async () => {
  const { holder, writer, close } = openPair(400);
  try {
    holder.exec('BEGIN IMMEDIATE');
    // The holder would commit after 50 ms, but that timer only fires once the thread is free again.
    setTimeout(() => holder.exec('COMMIT'), 50);
    const startedAt = Date.now();
    assert.throws(() => writer.prepare("INSERT INTO settings VALUES ('star', 'on')").run(), /database is locked/);
    assert.ok(Date.now() - startedAt >= 400, 'the whole thread was stuck for the full busy timeout');
    await new Promise((resolve) => setTimeout(resolve, 80));
  } finally {
    close();
  }
});

test('a locked write fails fast, frees the thread and succeeds right after the holder commits', async () => {
  const { holder, writer, close } = openPair(0);
  try {
    holder.exec('BEGIN IMMEDIATE');
    holder.prepare("INSERT INTO settings VALUES ('sync', 'running')").run();
    setTimeout(() => holder.exec('COMMIT'), 50);
    let attempts = 0;
    const startedAt = Date.now();
    await retryWhileDatabaseLocked(async () => {
      attempts += 1;
      writer.prepare("INSERT INTO settings VALUES ('star', 'on')").run();
    });
    const elapsed = Date.now() - startedAt;
    assert.ok(attempts > 1, 'the first attempt hit the lock');
    assert.ok(elapsed < 400, `succeeded ${elapsed} ms after the start, not after a busy timeout`);
    assert.deepEqual(
      writer.prepare('SELECT key, value FROM settings ORDER BY key').all(),
      [{ key: 'star', value: 'on' }, { key: 'sync', value: 'running' }],
    );
  } finally {
    close();
  }
});

test('errors other than a lock are not retried', async () => {
  let attempts = 0;
  await assert.rejects(retryWhileDatabaseLocked(async () => {
    attempts += 1;
    throw new Error('no such table: tracks');
  }), /no such table/);
  assert.equal(attempts, 1);
});

test('a lock that never clears gives up instead of waiting forever', async () => {
  const { holder, writer, close } = openPair(0);
  try {
    holder.exec('BEGIN IMMEDIATE');
    await assert.rejects(retryWhileDatabaseLocked(async () => {
      writer.prepare("INSERT INTO settings VALUES ('star', 'on')").run();
    }, 150), /database is locked/);
    holder.exec('ROLLBACK');
  } finally {
    close();
  }
});
