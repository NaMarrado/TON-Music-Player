import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }

  return db;
}

export function openDatabase(dbPath: string): Database.Database {
  db = new Database(dbPath);
  return db;
}

export function closeDatabase(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}
