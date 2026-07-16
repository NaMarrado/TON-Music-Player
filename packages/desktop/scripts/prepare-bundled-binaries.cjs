const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { gunzipSync } = require('zlib');

const execFileAsync = promisify(execFile);
const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DOWNLOAD_RETRY_DELAY_MS = 1_000;

async function prepareBundledBinaries(context) {
  const platform = context.electronPlatformName;
  const arch = getTargetArch(context);
  const binDir = path.join(__dirname, '..', 'build-resources', 'bin');

  await fs.promises.rm(binDir, { recursive: true, force: true });
  await fs.promises.mkdir(binDir, { recursive: true });

  const ytDlpPath = path.join(binDir, platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  await downloadFile(getYtDlpUrl(platform), ytDlpPath);
  await makeExecutable(ytDlpPath);

  const ffmpegPath = path.join(binDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  await downloadGzFile(getFfmpegUrl(platform, arch), ffmpegPath);
  await makeExecutable(ffmpegPath);

  if (platform === 'win32') {
    await downloadFile('https://7-zip.org/a/7zr.exe', path.join(binDir, '7zr.exe'));
    return;
  }

  const archivePath = path.join(binDir, '7zz.tar.xz');
  const tempDir = path.join(binDir, '_7zz');
  const sevenZipPath = path.join(binDir, '7zz');

  try {
    await downloadFile(get7zArchiveUrl(platform, arch), archivePath);
    await fs.promises.mkdir(tempDir, { recursive: true });
    await execFileAsync('tar', ['xJf', archivePath, '-C', tempDir], { timeout: 60_000 });
    await copyExtractedBinary(tempDir, sevenZipPath);
    await makeExecutable(sevenZipPath);
  } finally {
    await fs.promises.rm(archivePath, { force: true }).catch(() => {});
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadFile(url, destinationPath, options) {
  await downloadWithRetry(url, destinationPath, (buffer) => buffer, options);
}

async function downloadGzFile(url, destinationPath, options) {
  await downloadWithRetry(url, destinationPath, (buffer) => gunzipSync(buffer), options);
}

async function downloadWithRetry(url, destinationPath, transform, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? DOWNLOAD_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DOWNLOAD_RETRY_DELAY_MS;
  let lastError;

  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tempPath = `${destinationPath}.part-${process.pid}-${attempt}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        throw new DownloadHttpError(url, response.status);
      }

      const downloaded = Buffer.from(await response.arrayBuffer());
      if (downloaded.length === 0) {
        throw new DownloadPayloadError(`Downloaded an empty file from ${url}`);
      }

      const output = transform(downloaded);
      if (!Buffer.isBuffer(output) || output.length === 0) {
        throw new DownloadPayloadError(`Downloaded file from ${url} produced no output`);
      }

      await fs.promises.writeFile(tempPath, output, { flag: 'wx' });
      await fs.promises.rename(tempPath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      await fs.promises.rm(tempPath, { force: true }).catch(() => {});

      if (attempt === maxAttempts || !isRetryableDownloadError(error)) {
        break;
      }

      const delayMs = retryDelayMs * attempt;
      console.warn(
        `[prepare-bundled-binaries] Download attempt ${attempt}/${maxAttempts} failed for ${url}; retrying in ${delayMs}ms: ${formatError(error)}`,
      );
      await delay(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `Failed to download ${url} after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}: ${formatError(lastError)}`,
    { cause: lastError },
  );
}

class DownloadHttpError extends Error {
  constructor(url, status) {
    super(`Failed to download ${url}: HTTP ${status}`);
    this.name = 'DownloadHttpError';
    this.status = status;
  }
}

class DownloadPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DownloadPayloadError';
  }
}

function isRetryableDownloadError(error) {
  if (error instanceof DownloadHttpError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }

  return (
    error instanceof DownloadPayloadError ||
    error instanceof TypeError ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    error?.code === 'Z_DATA_ERROR' ||
    error?.code === 'Z_BUF_ERROR'
  );
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function copyExtractedBinary(tempDir, destinationPath) {
  const directBinary = path.join(tempDir, '7zz');
  if (await pathExists(directBinary)) {
    await fs.promises.copyFile(directBinary, destinationPath);
    return;
  }

  const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nestedBinary = path.join(tempDir, entry.name, '7zz');
    if (await pathExists(nestedBinary)) {
      await fs.promises.copyFile(nestedBinary, destinationPath);
      return;
    }
  }

  throw new Error('7zz binary not found in archive');
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function makeExecutable(filePath) {
  if (process.platform !== 'win32') {
    await fs.promises.chmod(filePath, 0o755);
  }
}

function getYtDlpUrl(platform) {
  switch (platform) {
    case 'win32':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    case 'darwin':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    default:
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
  }
}

function getFfmpegUrl(platform, arch) {
  const targetPlatform =
    platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
  return `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-${targetPlatform}-${arch}.gz`;
}

function get7zArchiveUrl(platform, arch) {
  if (platform === 'darwin') {
    return 'https://7-zip.org/a/7z2501-mac.tar.xz';
  }

  return arch === 'arm64'
    ? 'https://7-zip.org/a/7z2501-linux-arm64.tar.xz'
    : 'https://7-zip.org/a/7z2501-linux-x64.tar.xz';
}

function getTargetArch(context) {
  switch (context.arch) {
    case 0:
      return 'ia32';
    case 2:
      return 'armv7l';
    case 3:
      return 'arm64';
    case 1:
    case 4:
      return 'x64';
    default:
      return process.arch === 'arm64' ? 'arm64' : 'x64';
  }
}

module.exports = prepareBundledBinaries;
module.exports.testables = {
  downloadFile,
  downloadGzFile,
};
