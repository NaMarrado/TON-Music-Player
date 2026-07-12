let ytDlpPath: string | null = null;
let ffmpegPath: string | null = null;
let sevenZipPath: string | null = null;
let downloading = false;

export function getYtDlpPathState(): string | null {
  return ytDlpPath;
}

export function setYtDlpPathState(nextPath: string | null): void {
  ytDlpPath = nextPath;
}

export function getFfmpegPathState(): string | null {
  return ffmpegPath;
}

export function setFfmpegPathState(nextPath: string | null): void {
  ffmpegPath = nextPath;
}

export function getSevenZipPathState(): string | null {
  return sevenZipPath;
}

export function setSevenZipPathState(nextPath: string | null): void {
  sevenZipPath = nextPath;
}

export function isBinaryDownloadInProgress(): boolean {
  return downloading;
}

export function setBinaryDownloadInProgress(nextValue: boolean): void {
  downloading = nextValue;
}
