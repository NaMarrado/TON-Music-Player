import type { DownloadQualityProfile, DownloadSource } from '@ton/core';

const COMPATIBLE_M4A_SELECTOR = 'bestaudio[ext=m4a][acodec^=mp4a]';
const BEST_AVAILABLE_AUDIO_SELECTOR = 'bestaudio';

export function getYtDlpAudioFormatSelector(source: DownloadSource): string {
  return source === 'soundcloud'
    ? `${COMPATIBLE_M4A_SELECTOR}/${BEST_AVAILABLE_AUDIO_SELECTOR}`
    : COMPATIBLE_M4A_SELECTOR;
}

export function getRequiredAacBitrate(
  qualityProfile: DownloadQualityProfile,
  inputExtension: string,
): string | null {
  if (qualityProfile === 'normal') {
    return '96k';
  }

  return inputExtension.toLowerCase() === '.m4a' ? null : '192k';
}
