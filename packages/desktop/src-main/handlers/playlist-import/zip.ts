import { execFile } from 'child_process';

export function extractZipArchive(zipPath: string, targetDir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile('unzip', ['-o', zipPath, '-d', targetDir], { timeout: 300000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
