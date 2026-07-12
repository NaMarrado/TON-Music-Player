import fs from 'fs';
import type { Playlist } from '@ton/core';
import { getDb } from '../../services/database';

export async function normalizePlaylistCover(playlist: Playlist | null): Promise<Playlist | null> {
  if (!playlist?.cover_path) {
    return playlist;
  }

  if (await hasReadableCoverPath(playlist.cover_path)) {
    return playlist;
  }

  clearPlaylistCoverPath(playlist.id);
  return { ...playlist, cover_path: null };
}

export async function normalizePlaylistCovers(playlists: Playlist[]): Promise<Playlist[]> {
  return await Promise.all(playlists.map((playlist) => normalizePlaylistCover(playlist))) as Playlist[];
}

async function hasReadableCoverPath(coverPath: string): Promise<boolean> {
  try {
    await fs.promises.access(coverPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function clearPlaylistCoverPath(playlistId: number): void {
  getDb().prepare('UPDATE playlists SET cover_path = NULL WHERE id = ?').run(playlistId);
}
