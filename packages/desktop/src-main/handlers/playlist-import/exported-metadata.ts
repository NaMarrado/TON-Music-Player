import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { copyToArtwork, type TrackMetaEntry } from '../playlist-helpers';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readExportedMetadata(
  dir: string,
  fallbackName: string,
): Promise<{
  playlistName: string;
  coverPath: string | null;
  tracksMeta: Record<string, TrackMetaEntry>;
  artworkMap: Map<string, string>;
}> {
  let playlistName = fallbackName;
  let coverPath: string | null = null;
  let tracksMeta: Record<string, TrackMetaEntry> = {};
  const artworkMap = new Map<string, string>();

  const playlistMetaPath = path.join(dir, '_playlist.json');
  if (await pathExists(playlistMetaPath)) {
    try {
      const playlistMeta = JSON.parse(await fs.promises.readFile(playlistMetaPath, 'utf-8')) as {
        name?: string;
        cover?: string | null;
      };
      if (playlistMeta.name) {
        playlistName = playlistMeta.name;
      }
      if (playlistMeta.cover) {
        const extractedCover = path.join(dir, playlistMeta.cover);
        if (await pathExists(extractedCover)) {
          coverPath = await copyToArtwork(extractedCover, `playlist-${Date.now()}`);
        }
      }
    } catch {
      // Ignore malformed metadata and fall back to folder name.
    }
  }

  const tracksMetaPath = path.join(dir, '_tracks.json');
  if (await pathExists(tracksMetaPath)) {
    try {
      tracksMeta = JSON.parse(await fs.promises.readFile(tracksMetaPath, 'utf-8'));
    } catch {
      // Ignore malformed per-track metadata.
    }
  }

  const artworkDir = path.join(app.getPath('userData'), 'artwork');
  await fs.promises.mkdir(artworkDir, { recursive: true });

  for (const entry of await fs.promises.readdir(dir)) {
    if (!entry.startsWith('_art_')) continue;

    const src = path.join(dir, entry);
    const origName = entry.slice(5);
    const dest = path.join(artworkDir, origName);
    if (!(await pathExists(dest))) {
      await fs.promises.copyFile(src, dest);
    }
    artworkMap.set(entry, dest);
  }

  const artworkSubDir = path.join(dir, 'artwork');
  if (await pathExists(artworkSubDir) && (await fs.promises.stat(artworkSubDir)).isDirectory()) {
    for (const entry of await fs.promises.readdir(artworkSubDir)) {
      const src = path.join(artworkSubDir, entry);
      if (!(await fs.promises.stat(src)).isFile()) continue;

      const dest = path.join(artworkDir, entry);
      if (!(await pathExists(dest))) {
        await fs.promises.copyFile(src, dest);
      }
      artworkMap.set(`artwork/${entry}`, dest);
    }
  }

  return { playlistName, coverPath, tracksMeta, artworkMap };
}
