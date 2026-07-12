import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';

let smokeRootDir: string | null = null;

export function requireSmokeRoot(): string {
  if (!smokeRootDir) {
    throw new Error('Smoke root directory was not prepared');
  }

  return smokeRootDir;
}

export function prepareHandlerSmokePaths(): void {
  if (smokeRootDir) {
    return;
  }

  smokeRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ton-desktop-api-'));
  const userDataDir = path.join(smokeRootDir, 'userData');
  const musicDir = path.join(smokeRootDir, 'music');
  const downloadsDir = path.join(smokeRootDir, 'downloads');
  const tempDir = path.join(smokeRootDir, 'temp');

  for (const dir of [userDataDir, musicDir, downloadsDir, tempDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  app.setPath('userData', userDataDir);
  app.setPath('music', musicDir);
  app.setPath('downloads', downloadsDir);
  app.setPath('temp', tempDir);
}

export function cleanupHandlerSmokePaths(): void {
  if (!smokeRootDir) {
    return;
  }

  fs.rmSync(smokeRootDir, { recursive: true, force: true });
  smokeRootDir = null;
}
