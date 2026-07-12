import { exec } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { BinaryDependencyId, BinaryLookupResult } from './types';

async function pathExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function makeExecutable(filePath: string): void {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

export async function findBinaryAsync(id: BinaryDependencyId): Promise<string | null> {
  return (await findBinaryDetailsAsync(id)).path;
}

export async function findBinaryDetailsAsync(id: BinaryDependencyId): Promise<BinaryLookupResult> {
  for (const executableName of getBinaryCandidates(id)) {
    if (process.resourcesPath) {
      const bundledPath = path.join(process.resourcesPath, 'bin', executableName);
      if (await pathExistsAsync(bundledPath)) {
        return { id, executableName, path: bundledPath, status: 'bundled' };
      }
    }

    try {
      const downloadedPath = path.join(app.getPath('userData'), 'bin', executableName);
      if (await pathExistsAsync(downloadedPath)) {
        return { id, executableName, path: downloadedPath, status: 'downloaded' };
      }
    } catch {
      // app not ready yet
    }
  }

  for (const executableName of getBinaryCandidates(id)) {
    const systemPath = await findSystemBinaryAsync(executableName);
    if (systemPath) {
      return { id, executableName, path: systemPath, status: 'system' };
    }
  }

  return {
    id,
    executableName: getBinaryCandidates(id)[0] ?? null,
    path: null,
    status: 'missing',
  };
}

function getBinaryCandidates(id: BinaryDependencyId): string[] {
  switch (id) {
    case 'yt-dlp':
      return [withPlatformExecutable('yt-dlp')];
    case 'ffmpeg':
      return [withPlatformExecutable('ffmpeg')];
    case '7zz':
      if (process.platform === 'win32') {
        return ['7zz.exe', '7z.exe', '7zr.exe'];
      }
      return ['7zz', '7z'];
    default:
      return [];
  }
}

function withPlatformExecutable(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

async function findSystemBinaryAsync(executableName: string): Promise<string | null> {
  const command = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    exec(`${command} ${executableName}`, { timeout: 5000 }, async (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }

      const firstLine = stdout.trim().split('\n')[0]?.trim();
      if (!firstLine) {
        resolve(null);
        return;
      }

      resolve(await pathExistsAsync(firstLine) ? firstLine : null);
    });
  });
}
