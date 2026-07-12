import fs from 'fs';
import path from 'path';
import extract from 'extract-zip';
import type { ExportManifest } from '@ton/core';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveImportBundleDirectory(directoryPath: string): Promise<string> {
  const directManifestPath = path.join(directoryPath, 'manifest.json');
  if (await pathExists(directManifestPath)) {
    return directoryPath;
  }

  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  const matchingChildren: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childDirectoryPath = path.join(directoryPath, entry.name);
    if (await pathExists(path.join(childDirectoryPath, 'manifest.json'))) {
      matchingChildren.push(childDirectoryPath);
    }
  }

  if (matchingChildren.length === 1) {
    return matchingChildren[0];
  }

  throw new Error('Invalid TON library bundle: missing manifest.json');
}

export async function extractImportBundle(bundlePath: string, tempDir: string): Promise<string> {
  const stats = await fs.promises.stat(bundlePath);
  if (stats.isDirectory()) {
    return resolveImportBundleDirectory(bundlePath);
  }

  await fs.promises.mkdir(tempDir, { recursive: true });
  await extract(bundlePath, { dir: tempDir });
  return tempDir;
}

export async function loadImportManifest(bundleDir: string): Promise<ExportManifest> {
  const manifestPath = path.join(bundleDir, 'manifest.json');

  try {
    await fs.promises.access(manifestPath);
  } catch {
    throw new Error('Invalid TON library bundle: missing manifest.json');
  }

  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as ExportManifest;
  if (!manifest.version || !manifest.tracks) {
    throw new Error('Invalid TON library bundle: corrupt manifest');
  }

  return manifest;
}
