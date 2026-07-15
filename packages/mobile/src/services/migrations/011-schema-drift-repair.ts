import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate008 } from './008-downloaded-at';

/**
 * Repairs installations that recorded migration 008 before its final schema
 * changes were shipped. migrate008 is idempotent and also restores the
 * canonical-library triggers expected by current reads and writes.
 */
export async function migrate011(db: SQLiteDatabase): Promise<void> {
  await migrate008(db);
}
