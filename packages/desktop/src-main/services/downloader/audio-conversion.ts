import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';

export async function transcodeAudioToM4a(
  inputFile: string,
  ffmpegPath: string,
  bitrate: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const inputExtension = path.extname(inputFile);
  const outputFile = inputExtension.toLowerCase() === '.m4a'
    ? inputFile
    : path.join(path.dirname(inputFile), `${path.basename(inputFile, inputExtension)}.m4a`);
  const tempFile = path.join(
    path.dirname(inputFile),
    `${path.basename(inputFile, inputExtension)}.aac-${randomUUID()}.m4a`,
  );
  const errors: string[] = [];
  const subprocess = spawn(ffmpegPath, [
    '-hide_banner', '-y', '-i', inputFile,
    '-map', '0:a:0', '-vn',
    '-c:a', 'aac', '-b:a', bitrate,
    '-map_metadata', '0', '-movflags', '+faststart', tempFile,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const stderr = createInterface({ input: subprocess.stderr });
  stderr.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed) errors.push(trimmed);
  });
  const abortHandler = () => subprocess.kill('SIGTERM');
  abortSignal.addEventListener('abort', abortHandler, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      subprocess.on('close', (code) => {
        if (abortSignal.aborted) reject(new Error('Cancelled'));
        else if (code === 0) resolve();
        else reject(new Error(errors.at(-1) || `ffmpeg exited with code ${code}`));
      });
      subprocess.on('error', reject);
    });

    const stats = await fs.promises.stat(tempFile);
    if (stats.size < 1000) {
      throw new Error('AAC conversion produced an invalid file');
    }

    if (outputFile === inputFile) {
      await replaceFileSafely(tempFile, inputFile);
    } else {
      await fs.promises.rename(tempFile, outputFile);
      await fs.promises.rm(inputFile, { force: true });
    }
    return outputFile;
  } catch (error) {
    await fs.promises.rm(tempFile, { force: true }).catch(() => {});
    throw error;
  } finally {
    abortSignal.removeEventListener('abort', abortHandler);
    stderr.close();
  }
}

async function replaceFileSafely(tempFile: string, destination: string): Promise<void> {
  const backup = `${destination}.source-${randomUUID()}`;
  await fs.promises.rename(destination, backup);
  try {
    await fs.promises.rename(tempFile, destination);
    await fs.promises.rm(backup, { force: true });
  } catch (error) {
    await fs.promises.rename(backup, destination).catch(() => {});
    throw error;
  }
}
