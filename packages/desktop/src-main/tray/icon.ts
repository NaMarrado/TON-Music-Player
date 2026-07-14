import { app, nativeImage } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function getIconPath(fileName: string): string | null {
  const candidates = [
    resolve(process.resourcesPath, fileName),
    resolve(process.cwd(), 'build-resources', fileName),
    resolve(process.cwd(), 'packages/desktop/build-resources', fileName),
    resolve(MODULE_DIR, '../../build-resources', fileName),
    resolve(app.getAppPath(), 'build-resources', fileName),
    resolve(app.getAppPath(), '../build-resources', fileName),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function createTrayIcon(): Electron.NativeImage {
  const icon16Path = getIconPath('tray-icon-16.png');
  const icon32Path = getIconPath('tray-icon-32.png');
  let image = icon16Path ? nativeImage.createFromPath(icon16Path) : nativeImage.createEmpty();

  if (!image.isEmpty() && icon32Path) {
    image.addRepresentation({
      scaleFactor: 2,
      buffer: readFileSync(icon32Path),
    });
  }

  if (image.isEmpty() && icon32Path) {
    image = nativeImage.createFromPath(icon32Path).resize({
      width: 16,
      height: 16,
      quality: 'best',
    });
  }

  if (image.isEmpty()) {
    const appIconPath = getIconPath('icon.png');
    if (appIconPath) {
      image = nativeImage.createFromPath(appIconPath).resize({
        width: 16,
        height: 16,
        quality: 'best',
      });
    }
  }

  if (image.isEmpty()) {
    throw new Error('TON tray icon assets are missing');
  }

  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }

  return image;
}
