import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createSchema } from '../../packages/desktop/src-main/services/database/schema.ts';
import { createMarkTrackImportedStatement } from '../../packages/desktop/src-main/services/library-import-timestamp.ts';

test('desktop imports fill a missing downloaded date without replacing an existing one', () => {
  const db = new Database(':memory:');
  try {
    createSchema(db);
    const missingId = Number(db.prepare(`
      INSERT INTO tracks(file_path, title, downloaded_at) VALUES (?, ?, NULL)
    `).run('/tmp/import-missing.m4a', 'Missing date').lastInsertRowid);
    const existingId = Number(db.prepare(`
      INSERT INTO tracks(file_path, title, downloaded_at) VALUES (?, ?, ?)
    `).run('/tmp/import-existing.m4a', 'Existing date', 123).lastInsertRowid);
    const markImported = createMarkTrackImportedStatement(db);
    markImported.run(456, missingId);
    markImported.run(456, existingId);

    const rows = db.prepare(`
      SELECT id, downloaded_at FROM tracks WHERE id IN (?, ?) ORDER BY id
    `).all(missingId, existingId) as Array<{ id: number; downloaded_at: number | null }>;
    assert.deepEqual(rows.map((row) => row.downloaded_at), [456, 123]);
  } finally {
    db.close();
  }
});
