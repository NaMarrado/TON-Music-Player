export const AGE_RESTRICTED_DOWNLOAD_MESSAGE =
  'This YouTube video is age restricted and cannot be downloaded.';

const AGE_RESTRICTED_PATTERNS = [
  /age[- ]restricted/i,
  /confirm your age/i,
  /verify your age/i,
  /inappropriate for some users/i,
];

function getRawFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? '').trim();
}

function getSafeFailureDetail(message: string): string {
  const line = message
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    return '';
  }

  const safe = line
    .replace(/https?:\/\/\S+/gi, 'the source URL')
    .replace(/^ERROR:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length > 180 ? `${safe.slice(0, 177)}...` : safe;
}

export function isAgeRestrictedDownloadError(error: unknown): boolean {
  const message = getRawFailureMessage(error);
  return AGE_RESTRICTED_PATTERNS.some((pattern) => pattern.test(message));
}

export function toDownloadFailureMessage(error: unknown): string {
  const message = getRawFailureMessage(error);

  if (isAgeRestrictedDownloadError(message)) {
    return AGE_RESTRICTED_DOWNLOAD_MESSAGE;
  }

  if (/private video|video is private|this video is private/i.test(message)) {
    return 'This YouTube video is private and cannot be downloaded.';
  }

  if (/copyright (?:claim|restriction)|blocked.*copyright|copyright.*blocked/i.test(message)) {
    return 'This YouTube video is unavailable because of a copyright restriction.';
  }

  if (/not available in your (?:country|region)|geo(?:graphically)?[- ]blocked/i.test(message)) {
    return 'This YouTube video is not available in your region.';
  }

  if (/members[- ]only|premium content|join this channel/i.test(message)) {
    return 'This YouTube video requires access that TON does not have.';
  }

  if (
    /video unavailable|video is unavailable|video is not available|content isn't available|has been removed|deleted video|this video has been removed/i
      .test(message)
  ) {
    return 'This YouTube video is unavailable or has been removed.';
  }

  if (
    /no youtube match found|no contents found in search response|search returned no (?:result|track)/i
      .test(message)
  ) {
    return 'No suitable YouTube match was found for this song.';
  }

  if (/no download url|missing final url|returned no final url/i.test(message)) {
    return 'The source did not provide a downloadable audio URL.';
  }

  if (
    /no compatible (?:aac|m4a)|incompatible (?:aac|m4a)|incompatible_download_mime|compatible m4a file|requested format is not available|no video formats found/i
      .test(message)
  ) {
    return 'No compatible M4A audio stream is available for this item.';
  }

  if (/\bHTTP 429\b|rate[- ]limit|too many requests|provider_rate_limited/i.test(message)) {
    return 'The source is temporarily rate limiting downloads. Try again later.';
  }

  if (/\bHTTP (?:404|410)\b|url is no longer available/i.test(message)) {
    return 'The download URL is no longer available.';
  }

  if (/\bHTTP 5\d\d\b|service unavailable|bad gateway/i.test(message)) {
    return 'The source is temporarily unavailable. Try again later.';
  }

  if (/\bHTTP 401\b|unauthorized/i.test(message)) {
    return 'The source requires access that TON does not have.';
  }

  if (/sign in to confirm you(?:'|’)re not a bot|bot verification/i.test(message)) {
    return 'YouTube requires verification before this video can be downloaded.';
  }

  if (/provider_exhausted|\bHTTP 403\b|forbidden|download link.*rejected/i.test(message)) {
    return 'The source rejected the download link. Use Retry to request a new link.';
  }

  if (/network request failed|network.*(?:lost|offline)|timed? out|timeout|econn|enotfound/i.test(message)) {
    return 'The download failed because of a network connection problem.';
  }

  if (/download too small|invalid or blocked audio|likely blocked/i.test(message)) {
    return 'The source returned an invalid or blocked audio file.';
  }

  if (/ffmpeg|aac conversion|conversion produced|transcod/i.test(message)) {
    return 'Audio conversion failed before the file could be saved.';
  }

  if (/cannot read downloaded file|downloaded file not found|enoent/i.test(message)) {
    return 'The downloaded audio file could not be saved.';
  }

  const detail = getSafeFailureDetail(message);
  return detail
    ? `Download failed: ${detail}`
    : 'The download failed unexpectedly. Use Retry to try again.';
}
