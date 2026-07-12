import { app } from 'electron';
import fs from 'fs';
import path from 'path';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getArtworkDir(): string {
  return path.join(app.getPath('userData'), 'artwork');
}

export async function ensureArtworkDir(dir: string): Promise<string> {
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveCoverArtToDir(
  pictures: Array<{ format: string; data: Buffer }>,
  fileHash: string,
  artworkDir: string,
): Promise<string | null> {
  const dir = await ensureArtworkDir(artworkDir);
  if (pictures.length === 0) {
    return null;
  }

  const picture = pictures[0];
  const ext = picture.format.includes('png') ? '.png' : '.jpg';
  const artworkPath = path.join(dir, `${fileHash}${ext}`);

  if (await pathExists(artworkPath)) {
    return artworkPath;
  }

  try {
    await fs.promises.writeFile(artworkPath, picture.data);
    return artworkPath;
  } catch {
    return null;
  }
}

export async function saveCoverArt(
  pictures: Array<{ format: string; data: Buffer }>,
  fileHash: string,
): Promise<string | null> {
  return saveCoverArtToDir(pictures, fileHash, getArtworkDir());
}
