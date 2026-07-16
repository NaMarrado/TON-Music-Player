import type { SQLiteDatabase } from 'expo-sqlite';
import { getPlaylistCoverPathRows, updatePlaylist } from '../db-queries';
import { shouldRewriteSandboxPath } from './path-utils';

interface PlaylistCoverSandboxPathRepair {
  id: number;
  coverPath: string;
}

export async function collectPlaylistCoverSandboxPathRepairs(): Promise<
  PlaylistCoverSandboxPathRepair[]
> {
  const playlists = await getPlaylistCoverPathRows();
  const repairs: PlaylistCoverSandboxPathRepair[] = [];

  for (const playlist of playlists) {
    const nextCoverPath = await shouldRewriteSandboxPath(playlist.cover_path);
    if (!nextCoverPath) {
      continue;
    }

    repairs.push({ id: playlist.id, coverPath: nextCoverPath });
  }

  return repairs;
}

export async function applyPlaylistCoverSandboxPathRepairs(
  database: SQLiteDatabase,
  repairs: PlaylistCoverSandboxPathRepair[],
): Promise<void> {
  for (const repair of repairs) {
    await updatePlaylist(repair.id, { cover_path: repair.coverPath }, database);
  }
}
