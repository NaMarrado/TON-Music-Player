import { findBinaryDetailsAsync } from './lookup';
import { getBinaryStatus } from './ensure';
import {
  getFfmpegPathState,
  getSevenZipPathState,
  getYtDlpPathState,
  setFfmpegPathState,
  setSevenZipPathState,
  setYtDlpPathState,
} from './state';

export {
  ensure7z,
  ensureBinaries,
  getBinaryStatusDetails,
  initBinaries,
  refreshBinaryState,
  repairBinaries,
} from './ensure';

export function getYtDlpPath(): string {
  const ytDlpPath = getYtDlpPathState();
  if (!ytDlpPath) {
    throw new Error('yt-dlp binary not found');
  }

  return ytDlpPath;
}

export function getFfmpegPath(): string | null {
  return getFfmpegPathState();
}

export function get7zPath(): string | null {
  return getSevenZipPathState();
}

export function areBinariesReady() {
  return getBinaryStatus();
}

export async function getYtDlpPathAsync(): Promise<string> {
  const cachedPath = getYtDlpPathState();
  if (cachedPath) {
    return cachedPath;
  }

  const ytDlp = await findBinaryDetailsAsync('yt-dlp');
  if (!ytDlp.path) {
    throw new Error('yt-dlp binary not found');
  }

  setYtDlpPathState(ytDlp.path);
  return ytDlp.path;
}

export async function getFfmpegPathAsync(): Promise<string | null> {
  const cachedPath = getFfmpegPathState();
  if (cachedPath) {
    return cachedPath;
  }

  const ffmpeg = await findBinaryDetailsAsync('ffmpeg');
  setFfmpegPathState(ffmpeg.path);
  return ffmpeg.path;
}

export async function get7zPathAsync(): Promise<string | null> {
  const cachedPath = getSevenZipPathState();
  if (cachedPath) {
    return cachedPath;
  }

  const sevenZip = await findBinaryDetailsAsync('7zz');
  setSevenZipPathState(sevenZip.path);
  return sevenZip.path;
}
