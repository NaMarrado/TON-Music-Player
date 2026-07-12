export type SearchErrorBannerConfig = {
  message: string;
  showSettings: boolean;
};

export function resolveSearchErrorBanner(
  source: 'spotify' | 'youtube' | 'soundcloud',
  errorMessage: string,
  t: (key: string) => string,
): SearchErrorBannerConfig {
  const normalized = normalizeErrorMessage(errorMessage);
  const lower = normalized.toLowerCase();

  if (source === 'spotify') {
    if (lower.includes('credentials not configured')) {
      return { message: t('spotifyError'), showSettings: true };
    }
    if (lower.includes('timed out')) {
      return { message: t('spotifyTimeoutError'), showSettings: false };
    }
    return { message: t('spotifyProviderError'), showSettings: false };
  }

  if (source === 'youtube') {
    if (lower.includes('timed out')) {
      return { message: t('youtubeError'), showSettings: false };
    }
    return { message: t('youtubeProviderError'), showSettings: false };
  }

  if (lower.includes('yt-dlp binary not found')) {
    return { message: t('soundcloudError'), showSettings: true };
  }
  if (lower.includes('timed out')) {
    return { message: t('soundcloudTimeoutError'), showSettings: false };
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return { message: t('soundcloudRateLimitError'), showSettings: false };
  }
  if (lower.includes('parse soundcloud')) {
    return { message: t('soundcloudParseError'), showSettings: false };
  }

  return { message: normalized || t('soundcloudProviderError'), showSettings: false };
}

function normalizeErrorMessage(errorMessage: string): string {
  return errorMessage
    .replace(/\s+/g, ' ')
    .replace(/^error:\s*/i, '')
    .replace(/^command failed:\s*/i, '')
    .trim();
}
