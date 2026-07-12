import { app } from 'electron';
import path from 'path';
import { closeDatabase as closeDatabaseConnection, openDatabase } from './connection';
import { seedDefaults } from './defaults';
import { migrateSchema } from './migrations';
import { createSchema } from './schema';
import { migrateCanonicalLibraryStorage } from './canonical-library-migration';

export { getDb } from './connection';

export function initDatabase(): void {
  const db = openDatabase(path.join(app.getPath('userData'), 'ton.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  migrateSchema(db);
  seedDefaults(db);
  migrateCanonicalLibraryStorage(db, path.join(app.getPath('music'), 'TON'));
}

export function closeDatabase(): void {
  closeDatabaseConnection();
}
