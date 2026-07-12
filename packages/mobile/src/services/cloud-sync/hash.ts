import * as FileSystem from 'expo-file-system';
import { base64ToBytes, createSha256Hasher } from '@ton/core';

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
