import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';
import type { DownloadItem } from '@ton/core';
import { getFfmpegPathAsync, getYtDlpPathAsync } from '../binary-manager';
import { findNonCollidingFileAsync } from '../library-paths';
import { buildSafeOutputTitle, findOutputFile, getDownloadDir } from './file-output';
import { YT_DLP_DOWNLOAD_PROGRESS_TEMPLATE } from './progress-template';
import type { ProgressBridge } from './progress-bridge';

export async function downloadWithYtDlp(
  item: DownloadItem,
  downloadUrl: string,
  abortSignal: AbortSignal,
  progressBridge: ProgressBridge,
): Promise<string> {
  const downloadDir = getDownloadDir();
  await fs.promises.mkdir(downloadDir, { recursive: true });
  const safeTitle = buildSafeOutputTitle(
    `${item.artist || 'Unknown'} - ${item.title || 'Unknown'}`,
  );
  const stagingTitle = `${safeTitle}.ton-download-${item.id}`;
  const outputTemplate = path.join(downloadDir, `${stagingTitle}.%(ext)s`);
  const ffmpegPath = await getFfmpegPathAsync();

  const ytDlpArgs = [
    downloadUrl,
    '--format', 'bestaudio[ext=m4a][acodec^=mp4a]',
    '--output', outputTemplate,
    '--no-playlist',
    '--retries', '3',
    '--sleep-requests', '1',
    '--newline',
    '--progress-template', `download:${YT_DLP_DOWNLOAD_PROGRESS_TEMPLATE}`,
    '--no-color',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=default,-android_sdkless',
    '--embed-metadata',
    '--embed-thumbnail',
  ];

  if (ffmpegPath) {
    ytDlpArgs.push('--ffmpeg-location', path.dirname(ffmpegPath));
  }

  const subprocess = spawn(await getYtDlpPathAsync(), ytDlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  const abortHandler = () => {
    subprocess.kill('SIGTERM');
  };
  abortSignal.addEventListener('abort', abortHandler, { once: true });

  const errorLines: string[] = [];
  const stdout = createInterface({ input: subprocess.stdout });
  const stderr = createInterface({ input: subprocess.stderr });

  const handleOutputLine = (line: string, collectError: boolean) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (progressBridge.handleLine(trimmed)) {
      return;
    }

    if (collectError) {
      errorLines.push(trimmed);
    }
  };

  stdout.on('line', (line) => handleOutputLine(line, false));
  stderr.on('line', (line) => handleOutputLine(line, true));

  try {
    await new Promise<void>((resolve, reject) => {
      subprocess.on('close', (code: number | null) => {
        abortSignal.removeEventListener('abort', abortHandler);
        stdout.close();
        stderr.close();
        if (abortSignal.aborted) {
          reject(new Error('Cancelled'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(errorLines.at(-1) || `yt-dlp exited with code ${code}`));
        }
      });
      subprocess.on('error', reject);
    });
  } catch (error) {
    if (abortSignal.aborted) await removeDownloadStaging(downloadDir, stagingTitle);
    throw error;
  }

  const outputFile = await findOutputFile(downloadDir, stagingTitle);
  if (!outputFile) {
    throw new Error('Downloaded file not found');
  }

  if (path.extname(outputFile).toLowerCase() !== '.m4a') {
    throw new Error('Downloaded audio is not a compatible M4A file');
  }

  if (item.quality_profile === 'normal') {
    if (!ffmpegPath) throw new Error('ffmpeg is required for 96 kbps AAC conversion');
    await transcodeM4aTo96(outputFile, ffmpegPath, abortSignal);
  }

  if (abortSignal.aborted) {
    await removeDownloadStaging(downloadDir, stagingTitle);
    throw new Error('Cancelled');
  }

  const destination = await findNonCollidingFileAsync(downloadDir, `${safeTitle}.m4a`);
  await fs.promises.rename(outputFile, destination);
  return destination;
}

async function removeDownloadStaging(dir: string, stagingTitle: string): Promise<void> {
  await Promise.all([
    `${stagingTitle}.m4a`,
    `${stagingTitle}.m4a.part`,
    `${stagingTitle}.m4a.ytdl`,
  ].map((name) => fs.promises.rm(path.join(dir, name), { force: true }).catch(() => {})));
}

async function transcodeM4aTo96(
  inputFile: string,
  ffmpegPath: string,
  abortSignal: AbortSignal,
): Promise<void> {
  const tempFile = path.join(
    path.dirname(inputFile),
    `${path.basename(inputFile, '.m4a')}.normal-${randomUUID()}.m4a`,
  );
  const errors: string[] = [];
  const subprocess = spawn(ffmpegPath, [
    '-hide_banner', '-y', '-i', inputFile,
    '-map', '0:a:0', '-map', '0:v?',
    '-c:a', 'aac', '-b:a', '96k', '-c:v', 'copy',
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
    if (stats.size < 1000) throw new Error('AAC conversion produced an invalid file');
    await replaceFileSafely(tempFile, inputFile);
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
