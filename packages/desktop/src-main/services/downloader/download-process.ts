import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import type { DownloadItem } from '@ton/core';
import { getFfmpegPathAsync, getYtDlpPathAsync } from '../binary-manager';
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
  const outputTemplate = path.join(downloadDir, `${safeTitle}.%(ext)s`);
  const ffmpegPath = await getFfmpegPathAsync();

  const ytDlpArgs = [
    downloadUrl,
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
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

  const outputFile = await findOutputFile(downloadDir, safeTitle);
  if (!outputFile) {
    throw new Error('Downloaded file not found');
  }

  return outputFile;
}
