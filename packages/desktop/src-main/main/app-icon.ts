import { app, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'com.ton.player';
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function getCandidateIconPaths(fileName: string): string[] {
  return [
    resolve(process.resourcesPath, fileName),
    resolve(process.cwd(), 'build-resources', fileName),
    resolve(process.cwd(), 'packages/desktop/build-resources', fileName),
    resolve(MODULE_DIR, '../../build-resources', fileName),
    resolve(app.getAppPath(), 'build-resources', fileName),
    resolve(app.getAppPath(), '../build-resources', fileName),
  ];
}

function getFirstExistingPath(fileName: string): string | null {
  for (const candidate of getCandidateIconPaths(fileName)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getAppIconPath(): string | null {
  return getFirstExistingPath('icon.png');
}

export function getDockIconPath(): string | null {
  return getFirstExistingPath('dock-icon.png') ?? getAppIconPath();
}

export function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }

  const iconPath = getDockIconPath();
  if (!iconPath) {
    return;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock.setIcon(icon);
  }
}

export function applyPlatformAppIdentity(): void {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }
}
