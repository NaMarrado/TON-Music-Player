import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { toDownloadFailureMessage, type DownloadItem } from '@ton/core';
import { getFfmpegPathAsync, getYtDlpPathAsync } from '../binary-manager';
import { findNonCollidingFileAsync } from '../library-paths';
import { transcodeAudioToM4a } from './audio-conversion';
import { getRequiredAacBitrate, getYtDlpAudioFormatSelector } from './audio-policy';
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
    '--format', getYtDlpAudioFormatSelector(item.source),
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
          const details = errorLines.length > 0
            ? errorLines.join('\n')
            : `yt-dlp exited with code ${code}`;
          reject(new Error(toDownloadFailureMessage(details)));
        }
      });
      subprocess.on('error', reject);
    });
  } catch (error) {
    await removeDownloadStaging(downloadDir, stagingTitle);
    throw error;
  }

  try {
    const downloadedFile = await findOutputFile(downloadDir, stagingTitle);
    if (!downloadedFile) {
      throw new Error('Downloaded audio file not found');
    }

    const bitrate = getRequiredAacBitrate(
      item.quality_profile,
      path.extname(downloadedFile),
    );
    const outputFile = bitrate == null
      ? downloadedFile
      : await transcodeDownloadedFile(downloadedFile, ffmpegPath, bitrate, abortSignal);

    if (path.extname(outputFile).toLowerCase() !== '.m4a') {
      throw new Error('Downloaded audio could not be converted to M4A');
    }
    if (abortSignal.aborted) {
      throw new Error('Cancelled');
    }

    const destination = await findNonCollidingFileAsync(downloadDir, `${safeTitle}.m4a`);
    await fs.promises.rename(outputFile, destination);
    return destination;
  } catch (error) {
    await removeDownloadStaging(downloadDir, stagingTitle);
    throw error;
  }
}

async function removeDownloadStaging(dir: string, stagingTitle: string): Promise<void> {
  const safePrefix = `${buildSafeOutputTitle(stagingTitle)}.`;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(safePrefix))
    .map((entry) => fs.promises.rm(path.join(dir, entry.name), { force: true }).catch(() => {})));
}

async function transcodeDownloadedFile(
  inputFile: string,
  ffmpegPath: string | null,
  bitrate: string,
  abortSignal: AbortSignal,
): Promise<string> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg is required to convert downloaded audio to M4A');
  }
  return transcodeAudioToM4a(inputFile, ffmpegPath, bitrate, abortSignal);
}
