import fs from 'fs';

export function cleanupImportTempDir(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Non-critical cleanup failure.
  }
}
