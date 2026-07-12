export function getYtDlpUrl(): string {
  switch (process.platform) {
    case 'win32':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    case 'darwin':
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    default:
      return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
  }
}

export function getFfmpegUrl(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const platform = process.platform === 'win32'
    ? 'win32'
    : process.platform === 'darwin'
      ? 'darwin'
      : 'linux';
  return `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-${platform}-${arch}.gz`;
}

export function get7zArchiveUrl(): string {
  if (process.platform === 'darwin') {
    return 'https://7-zip.org/a/7z2501-mac.tar.xz';
  }

  return process.arch === 'arm64'
    ? 'https://7-zip.org/a/7z2501-linux-arm64.tar.xz'
    : 'https://7-zip.org/a/7z2501-linux-x64.tar.xz';
}
