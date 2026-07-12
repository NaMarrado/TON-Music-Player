import { getDb } from '../../services/database';

export function getExistingLibraryHashes(db: ReturnType<typeof getDb>): Set<string> {
  const existingHashes = new Set<string>();
  const rows = db
    .prepare('SELECT file_hash FROM tracks WHERE in_library = 1 AND file_hash IS NOT NULL')
    .all() as Array<{ file_hash: string }>;

  for (const row of rows) {
    existingHashes.add(row.file_hash);
  }

  return existingHashes;
}
