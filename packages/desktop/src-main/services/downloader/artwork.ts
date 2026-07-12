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

export async function downloadCoverArt(coverUrl: string, fileHash: string): Promise<string | null> {
  try {
    const artworkDir = path.join(app.getPath('userData'), 'artwork');
    await fs.promises.mkdir(artworkDir, { recursive: true });

    const ext = coverUrl.includes('.png') ? '.png' : '.jpg';
    const artworkPath = path.join(artworkDir, `${fileHash}${ext}`);
    if (await pathExists(artworkPath)) {
      return artworkPath;
    }

    const response = await fetch(coverUrl);
    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(artworkPath, buffer);
    return artworkPath;
  } catch {
    return null;
  }
}
