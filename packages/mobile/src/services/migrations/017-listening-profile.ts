import type { SQLiteDatabase } from 'expo-sqlite';
import { PROFILE_SCHEMA_SQL } from '@ton/core';

/** Device-scoped listening records and the private-statistics sync cache. */
export async function migrate017(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(PROFILE_SCHEMA_SQL);
}
