import fs from 'node:fs';
import path from 'node:path';
import type { ExportBundleFormat } from './types';

function buildSiblingPath(destinationPath: string, kind: 'backup' | 'partial'): string {
  const suffix = `.${kind}-${process.pid}-${Date.now()}`;
  return path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}${suffix}`,
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function runAtomicExport<Result>(
  destinationPath: string,
  _bundleFormat: ExportBundleFormat,
  createExport: (stagingPath: string) => Promise<Result>,
): Promise<Result> {
  const stagingPath = buildSiblingPath(destinationPath, 'partial');
  const backupPath = buildSiblingPath(destinationPath, 'backup');
  let destinationMovedToBackup = false;
  await fs.promises.rm(stagingPath, { force: true, recursive: true });
  await fs.promises.rm(backupPath, { force: true, recursive: true });

  try {
    const result = await createExport(stagingPath);
    if (await pathExists(destinationPath)) {
      await fs.promises.rename(destinationPath, backupPath);
      destinationMovedToBackup = true;
    }
    await fs.promises.rename(stagingPath, destinationPath);
    if (destinationMovedToBackup) {
      destinationMovedToBackup = false;
      await fs.promises.rm(backupPath, { force: true, recursive: true }).catch(() => {});
    }
    return result;
  } catch (error) {
    await fs.promises.rm(stagingPath, { force: true, recursive: true }).catch(() => {});
    if (destinationMovedToBackup && !(await pathExists(destinationPath))) {
      try {
        await fs.promises.rename(backupPath, destinationPath);
        destinationMovedToBackup = false;
      } catch (restoreError) {
        const originalDetail = error instanceof Error ? error.message : String(error);
        const restoreDetail = restoreError instanceof Error
          ? restoreError.message
          : String(restoreError);
        throw new Error(
          `Export failed and the previous destination could not be restored. `
          + `Backup kept at ${backupPath}. Export error: ${originalDetail}. `
          + `Restore error: ${restoreDetail}`,
        );
      }
    }
    throw error;
  } finally {
    await fs.promises.rm(stagingPath, { force: true, recursive: true }).catch(() => {});
    if (!destinationMovedToBackup) {
      await fs.promises.rm(backupPath, { force: true, recursive: true }).catch(() => {});
    }
  }
}
