import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDb } from '../../../services/database';

export async function resolveImportDownloadDir(): Promise<string> {
  const db = getDb();
  const dirSetting = db.prepare("SELECT value FROM settings WHERE key = 'download_directory'")
    .get() as { value: string } | undefined;

  const downloadDir = dirSetting?.value
    ? dirSetting.value
    : path.join(app.getPath('music'), 'TON');

  await fs.promises.mkdir(downloadDir, { recursive: true });
  return downloadDir;
}

export function loadExistingTrackHashes(): Set<string> {
  const db = getDb();
  const existingHashes = new Set<string>();
  const hashRows = db.prepare(`
    SELECT file_hash, content_hash_sha256
    FROM tracks
    WHERE file_hash IS NOT NULL OR content_hash_sha256 IS NOT NULL
  `).all() as Array<{ file_hash: string | null; content_hash_sha256: string | null }>;

  for (const row of hashRows) {
    if (row.file_hash) existingHashes.add(row.file_hash);
    if (row.content_hash_sha256) existingHashes.add(row.content_hash_sha256);
  }

  return existingHashes;
}
