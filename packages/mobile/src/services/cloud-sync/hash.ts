import * as FileSystem from 'expo-file-system';
import { base64ToBytes, createSha256Hasher } from '@ton/core';
import { runMobileCloudDbLane } from './db-lane';

const HASH_CHUNK_BYTES = 1024 * 1024;

export async function hashFileSha256(fileUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(fileUri, { size: true });
  if (!info.exists || typeof info.size !== 'number') {
    throw new Error(`Cannot hash missing file: ${fileUri}`);
  }

  const hasher = createSha256Hasher();
  for (let position = 0; position < info.size; position += HASH_CHUNK_BYTES) {
    const length = Math.min(HASH_CHUNK_BYTES, info.size - position);
    const chunk = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    hasher.update(base64ToBytes(chunk));
  }
  return hasher.digestHex();
}

export async function hashCloudArtworkCached(fileUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(fileUri, { size: true });
  if (
    !info.exists
    || typeof info.size !== 'number'
    || typeof info.modificationTime !== 'number'
  ) {
    return hashFileSha256(fileUri);
  }
  const cached = await runMobileCloudDbLane((db) => db.getFirstAsync<{ sha256: string }>(
    `SELECT sha256 FROM cloud_sync_hash_cache
     WHERE file_path = ? AND file_size = ? AND file_mtime = ?`,
    [fileUri, info.size, info.modificationTime],
  ));
  if (cached?.sha256) {
    return cached.sha256;
  }
  const sha256 = await hashFileSha256(fileUri);
  await runMobileCloudDbLane((db) => db.runAsync(
    `INSERT INTO cloud_sync_hash_cache(file_path, file_size, file_mtime, sha256)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(file_path) DO UPDATE SET
       file_size = excluded.file_size,
       file_mtime = excluded.file_mtime,
       sha256 = excluded.sha256,
       updated_at = strftime('%s','now')`,
    [fileUri, info.size, info.modificationTime, sha256],
  ).then(() => undefined));
  return sha256;
}
