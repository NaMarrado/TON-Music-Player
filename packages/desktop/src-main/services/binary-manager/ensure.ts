import { execFile } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { downloadFile, downloadGzFile } from './download';
import { findBinaryDetailsAsync, makeExecutable } from './lookup';
import {
  getFfmpegPathState,
  getSevenZipPathState,
  getYtDlpPathState,
  isBinaryDownloadInProgress,
  setBinaryDownloadInProgress,
  setFfmpegPathState,
  setSevenZipPathState,
  setYtDlpPathState,
} from './state';
import type { BinaryLookupResult } from './types';
import { get7zArchiveUrl, getFfmpegUrl, getYtDlpUrl } from './urls';

const execFileAsync = promisify(execFile);

export type BinaryStatus = {
  ytDlp: boolean;
  ffmpeg: boolean;
  sevenZip: boolean;
};

export type BinaryStatusDetail = BinaryLookupResult;

export function initBinaries(): BinaryStatus {
  void refreshBinaryState();
  return getBinaryStatus();
}

export async function refreshBinaryState(): Promise<BinaryStatus> {
  const [ytDlp, ffmpeg, sevenZip] = await Promise.all([
    findBinaryDetailsAsync('yt-dlp'),
    findBinaryDetailsAsync('ffmpeg'),
    findBinaryDetailsAsync('7zz'),
  ]);

  setYtDlpPathState(ytDlp.path);
  setFfmpegPathState(ffmpeg.path);
  setSevenZipPathState(sevenZip.path);
  return getBinaryStatus();
}

export async function ensureBinaries(onStatus?: (message: string) => void): Promise<void> {
  if (isBinaryDownloadInProgress()) {
    return;
  }

  setBinaryDownloadInProgress(true);
  const binaryDir = path.join(app.getPath('userData'), 'bin');
  await fs.promises.mkdir(binaryDir, { recursive: true });

  try {
    await refreshBinaryState();

    if (!getYtDlpPathState()) {
      onStatus?.('Downloading yt-dlp...');
      const destination = path.join(binaryDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
      await downloadFile(getYtDlpUrl(), destination);
      makeExecutable(destination);
      setYtDlpPathState(destination);
      onStatus?.('yt-dlp ready');
    }

    if (!getFfmpegPathState()) {
      onStatus?.('Downloading ffmpeg...');
      const destination = path.join(binaryDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      await downloadGzFile(getFfmpegUrl(), destination);
      makeExecutable(destination);
      setFfmpegPathState(destination);
      onStatus?.('ffmpeg ready');
    }

    await refreshBinaryState();
  } finally {
    setBinaryDownloadInProgress(false);
  }
}

export async function ensure7z(): Promise<string> {
  const existingPath = getSevenZipPathState();
  if (existingPath) {
    return existingPath;
  }

  const binaryDir = path.join(app.getPath('userData'), 'bin');
  await fs.promises.mkdir(binaryDir, { recursive: true });

  if (process.platform === 'win32') {
    const destination = path.join(binaryDir, '7zr.exe');
    await downloadFile('https://7-zip.org/a/7zr.exe', destination);
    setSevenZipPathState(destination);
    return destination;
  }

  const temporaryArchive = path.join(binaryDir, '7z_download.tar.xz');
  const temporaryDir = path.join(binaryDir, '7z_extract');
  const destination = path.join(binaryDir, '7zz');

  try {
    await downloadFile(get7zArchiveUrl(), temporaryArchive);
    await fs.promises.mkdir(temporaryDir, { recursive: true });
    await execFileAsync('tar', ['xJf', temporaryArchive, '-C', temporaryDir], { timeout: 60000 });
    await copyExtracted7zBinary(temporaryDir, destination);
    makeExecutable(destination);
    setSevenZipPathState(destination);
    return destination;
  } finally {
    await fs.promises.rm(temporaryArchive, { force: true }).catch(() => {});
    await fs.promises.rm(temporaryDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function getBinaryStatus(): BinaryStatus {
  return {
    ytDlp: !!getYtDlpPathState(),
    ffmpeg: !!getFfmpegPathState(),
    sevenZip: !!getSevenZipPathState(),
  };
}

export async function getBinaryStatusDetails(): Promise<BinaryStatusDetail[]> {
  return Promise.all([
    findBinaryDetailsAsync('yt-dlp'),
    findBinaryDetailsAsync('ffmpeg'),
    findBinaryDetailsAsync('7zz'),
  ]);
}

export async function repairBinaries(onStatus?: (message: string) => void): Promise<BinaryStatusDetail[]> {
  onStatus?.('Checking desktop dependencies...');
  await refreshBinaryState();
  await ensureBinaries(onStatus);

  if (!getSevenZipPathState()) {
    onStatus?.('Installing 7zz...');
    await ensure7z();
  }

  await refreshBinaryState();
  onStatus?.('Desktop dependencies ready');
  return getBinaryStatusDetails();
}

async function copyExtracted7zBinary(temporaryDir: string, destinationPath: string): Promise<void> {
  const directBinary = path.join(temporaryDir, '7zz');
  if (await pathExists(directBinary)) {
    await fs.promises.copyFile(directBinary, destinationPath);
    return;
  }

  const entries = await fs.promises.readdir(temporaryDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nestedBinary = path.join(temporaryDir, entry.name, '7zz');
    if (await pathExists(nestedBinary)) {
      await fs.promises.copyFile(nestedBinary, destinationPath);
      return;
    }
  }

  throw new Error('7zz binary not found in archive');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
