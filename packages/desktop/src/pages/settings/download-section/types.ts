export type DesktopBinaryStatus = {
  id: 'yt-dlp' | 'ffmpeg' | '7zz';
  executableName: string | null;
  path: string | null;
  status: 'bundled' | 'downloaded' | 'system' | 'missing';
};

export const BINARY_ORDER: DesktopBinaryStatus['id'][] = ['yt-dlp', 'ffmpeg', '7zz'];

export const BINARY_METADATA: Record<DesktopBinaryStatus['id'], {
  descriptionKey: string;
  label: string;
  required: boolean;
}> = {
  'yt-dlp': {
    label: 'yt-dlp',
    descriptionKey: 'dependencyYtDlpDescription',
    required: true,
  },
  ffmpeg: {
    label: 'ffmpeg',
    descriptionKey: 'dependencyFfmpegDescription',
    required: true,
  },
  '7zz': {
    label: '7zz',
    descriptionKey: 'dependency7zzDescription',
    required: false,
  },
};

export const BINARY_STATUS_LABELS: Record<DesktopBinaryStatus['status'], string> = {
  bundled: 'dependencyBundled',
  downloaded: 'dependencyDownloaded',
  system: 'dependencySystem',
  missing: 'dependencyMissing',
};

export function isRequiredBinary(id: DesktopBinaryStatus['id']): boolean {
  return BINARY_METADATA[id].required;
}
