import type { SQLiteDatabase } from 'expo-sqlite';
import { getAllTrackAssetRows, updateTrack } from '../db-queries';
import { shouldRewriteSandboxPath } from './path-utils';

interface TrackSandboxPathRepair {
  id: number;
  filePath: string | null;
  coverArtPath: string | null;
}

export async function collectTrackSandboxPathRepairs(): Promise<TrackSandboxPathRepair[]> {
  const trackRows = await getAllTrackAssetRows();
  const repairs: TrackSandboxPathRepair[] = [];

  for (const track of trackRows) {
    const [nextFilePath, nextCoverArtPath] = await Promise.all([
      shouldRewriteSandboxPath(track.file_path),
      shouldRewriteSandboxPath(track.cover_art_path),
    ]);

    if (!nextFilePath && !nextCoverArtPath) {
      continue;
    }

    repairs.push({
      id: track.id,
      filePath: nextFilePath,
      coverArtPath: nextCoverArtPath,
    });
  }

  return repairs;
}

export async function applyTrackSandboxPathRepairs(
  database: SQLiteDatabase,
  repairs: TrackSandboxPathRepair[],
): Promise<void> {
  for (const repair of repairs) {
    await updateTrack(repair.id, {
      ...(repair.filePath ? { file_path: repair.filePath } : {}),
      ...(repair.coverArtPath ? { cover_art_path: repair.coverArtPath } : {}),
    }, database);
  }
}
