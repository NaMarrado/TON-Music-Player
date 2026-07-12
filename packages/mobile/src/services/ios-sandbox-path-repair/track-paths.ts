import { getAllTrackAssetRows, updateTrack } from '../db-queries';
import { shouldRewriteSandboxPath } from './path-utils';

export async function repairTrackSandboxPaths(): Promise<number> {
  const trackRows = await getAllTrackAssetRows();
  let repairedCount = 0;

  for (const track of trackRows) {
    const [nextFilePath, nextCoverArtPath] = await Promise.all([
      shouldRewriteSandboxPath(track.file_path),
      shouldRewriteSandboxPath(track.cover_art_path),
    ]);

    if (!nextFilePath && !nextCoverArtPath) {
      continue;
    }

    await updateTrack(track.id, {
      ...(nextFilePath ? { file_path: nextFilePath } : {}),
      ...(nextCoverArtPath ? { cover_art_path: nextCoverArtPath } : {}),
    });
    repairedCount += 1;
  }

  return repairedCount;
}
