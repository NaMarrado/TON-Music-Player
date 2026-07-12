import * as FileSystem from 'expo-file-system';
import {
  deleteTracks,
  getPlaylistReferenceCounts,
  getTrackAssetRowsByIds,
} from './db-queries';

async function deleteFilesBestEffort(paths: Array<string | null | undefined>): Promise<void> {
  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => Boolean(path))),
  );

  await Promise.all(
    uniquePaths.map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {})),
  );
}

export async function getTrackPlaylistReferenceCounts(trackIds: number[]): Promise<Record<number, number>> {
  return getPlaylistReferenceCounts(Array.from(new Set(trackIds)));
}

export async function deleteTracksEverywhere(trackIds: number[]): Promise<void> {
  const uniqueTrackIds = Array.from(new Set(trackIds));
  if (uniqueTrackIds.length === 0) {
    return;
  }

  const trackRows = await getTrackAssetRowsByIds(uniqueTrackIds);
  await deleteTracks(uniqueTrackIds);
  await deleteFilesBestEffort(trackRows.flatMap((track) => [track.file_path, track.cover_art_path]));
}

export async function cleanupOrphanedTracks(trackIds: number[]): Promise<number[]> {
  const uniqueTrackIds = Array.from(new Set(trackIds));
  if (uniqueTrackIds.length === 0) {
    return [];
  }

  const [trackRows, referenceCounts] = await Promise.all([
    getTrackAssetRowsByIds(uniqueTrackIds),
    getPlaylistReferenceCounts(uniqueTrackIds),
  ]);

  const orphanedTracks = trackRows.filter((track) => (
    track.in_library !== 1 && (referenceCounts[track.id] ?? 0) === 0
  ));

  if (orphanedTracks.length === 0) {
    return [];
  }

  const deletedTrackIds = orphanedTracks.map((track) => track.id);
  await deleteTracks(deletedTrackIds);
  await deleteFilesBestEffort(
    orphanedTracks.flatMap((track) => [track.file_path, track.cover_art_path]),
  );
  return deletedTrackIds;
}
