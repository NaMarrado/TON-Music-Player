import { getDb } from '../database';
import { readDesktopCloudOutbox } from './auto-sync-store';
import {
  deriveDesktopCloudApplyProtection,
  type DesktopCloudApplyProtection,
} from './apply-protection';

export function readCloudApplyProtection(
  scopeId: string,
  capturedGeneration: number,
): DesktopCloudApplyProtection {
  const db = getDb();
  const trackHash = db.prepare('SELECT content_hash_sha256 FROM tracks WHERE id = ?');
  const playlistCloudId = db.prepare('SELECT cloud_id FROM playlists WHERE id = ?');
  const entries = readDesktopCloudOutbox(scopeId)
    .filter((entry) => entry.generation > capturedGeneration);
  return deriveDesktopCloudApplyProtection(entries, {
    trackHash: (localId) => {
      const row = trackHash.get(localId) as { content_hash_sha256: string | null } | undefined;
      return row?.content_hash_sha256 || null;
    },
    playlistCloudId: (localId) => {
      const row = playlistCloudId.get(localId) as { cloud_id: string | null } | undefined;
      return row?.cloud_id || null;
    },
  });
}
