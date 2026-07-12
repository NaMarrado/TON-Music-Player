import { ipcMain } from 'electron';
import { getDb } from '../services/database';

interface TransactionStatement {
  sql: string;
  params?: unknown[];
}

export function registerDbHandlers(): void {
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    const db = getDb();
    const stmt = db.prepare(sql);
    return params ? stmt.all(...params) : stmt.all();
  });

  ipcMain.handle('db:execute', (_event, sql: string, params?: unknown[]) => {
    const db = getDb();
    const stmt = db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
  });

  ipcMain.handle('db:transaction', (_event, statements: TransactionStatement[]) => {
    const db = getDb();
    const results: { changes: number; lastInsertRowid: number }[] = [];

    const run = db.transaction(() => {
      for (const { sql, params } of statements) {
        const stmt = db.prepare(sql);
        const result = params ? stmt.run(...params) : stmt.run();
        results.push({ changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) });
      }
    });

    run();
    return results;
  });
}
