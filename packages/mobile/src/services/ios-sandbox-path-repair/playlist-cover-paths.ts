import { getPlaylistCoverPathRows, updatePlaylist } from '../db-queries';
import { shouldRewriteSandboxPath } from './path-utils';

export async function repairPlaylistCoverSandboxPaths(): Promise<number> {
  const playlists = await getPlaylistCoverPathRows();
  let repairedCount = 0;

  for (const playlist of playlists) {
    const nextCoverPath = await shouldRewriteSandboxPath(playlist.cover_path);
    if (!nextCoverPath) {
      continue;
    }

    await updatePlaylist(playlist.id, { cover_path: nextCoverPath });
    repairedCount += 1;
  }

  return repairedCount;
}
