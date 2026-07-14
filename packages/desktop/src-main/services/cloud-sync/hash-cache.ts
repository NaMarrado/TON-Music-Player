import fs from 'node:fs';
import { getDb } from '../database';
import { hashFileSha256 } from './hash';

type CachedHashRow = {
  file_size: number;
  file_mtime: number;
  sha256: string;
};

/** Cache artwork/cover hashes by the stable path + size + mtime tuple. */
export async function hashCloudArtworkFile(filePath: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await fs.promises.stat(filePath);
    const size = before.size;
    const mtime = Math.round(before.mtimeMs);
    const cached = getDb().prepare(`
      SELECT file_size, file_mtime, sha256
      FROM cloud_sync_hash_cache
      WHERE file_path = ?
    `).get(filePath) as CachedHashRow | undefined;
    if (cached && cached.file_size === size && cached.file_mtime === mtime) {
      return cached.sha256;
    }

    const sha256 = await hashFileSha256(filePath);
    const after = await fs.promises.stat(filePath);
    if (after.size !== size || Math.round(after.mtimeMs) !== mtime) continue;
    getDb().prepare(`
      INSERT INTO cloud_sync_hash_cache (
        file_path, file_size, file_mtime, sha256, updated_at
      ) VALUES (?, ?, ?, ?, strftime('%s','now'))
      ON CONFLICT(file_path) DO UPDATE SET
        file_size = excluded.file_size,
        file_mtime = excluded.file_mtime,
        sha256 = excluded.sha256,
        updated_at = excluded.updated_at
    `).run(filePath, size, mtime, sha256);
    return sha256;
  }
  throw new Error(`Artwork changed while hashing: ${filePath}`);
}
