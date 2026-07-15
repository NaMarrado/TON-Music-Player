export const AGE_RESTRICTED_DOWNLOAD_MESSAGE =
  'This YouTube video is age restricted and cannot be downloaded.';

export type DownloadFailureReason =
  | 'accessRequired'
  | 'ageRestricted'
  | 'authorizationRequired'
  | 'conversion'
  | 'copyrightRestricted'
  | 'fileSave'
  | 'invalidAudio'
  | 'network'
  | 'noCompatibleAudio'
  | 'noDownloadUrl'
  | 'noMatch'
  | 'privateVideo'
  | 'rateLimited'
  | 'regionRestricted'
  | 'rejectedLink'
  | 'sourceUnavailable'
  | 'unavailableVideo'
  | 'unknown'
  | 'urlUnavailable'
  | 'verificationRequired';

export type DownloadFailureTranslationKey = `failureReasons.${DownloadFailureReason}`;

const DOWNLOAD_FAILURE_MESSAGES: Record<DownloadFailureReason, string> = {
  accessRequired: 'This YouTube video requires access that TON does not have.',
  ageRestricted: AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  authorizationRequired: 'The source requires access that TON does not have.',
  conversion: 'Audio conversion failed before the file could be saved.',
  copyrightRestricted: 'This YouTube video is unavailable because of a copyright restriction.',
  fileSave: 'The downloaded audio file could not be saved.',
  invalidAudio: 'The source returned an invalid or blocked audio file.',
  network: 'The download failed because of a network connection problem.',
  noCompatibleAudio: 'No compatible M4A audio stream is available for this item.',
  noDownloadUrl: 'The source did not provide a downloadable audio URL.',
  noMatch: 'No suitable YouTube match was found for this song.',
  privateVideo: 'This YouTube video is private and cannot be downloaded.',
  rateLimited: 'The source is temporarily rate limiting downloads. Try again later.',
  regionRestricted: 'This YouTube video is not available in your region.',
  rejectedLink: 'The source rejected the download link. Use Retry to request a new link.',
  sourceUnavailable: 'The source is temporarily unavailable. Try again later.',
  unavailableVideo: 'This YouTube video is unavailable or has been removed.',
  unknown: 'The download failed unexpectedly. Use Retry to try again.',
  urlUnavailable: 'The download URL is no longer available.',
  verificationRequired: 'YouTube requires verification before this video can be downloaded.',
};

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

export function getDownloadFailureReason(error: unknown): DownloadFailureReason {
  const message = getRawFailureMessage(error);

  if (isAgeRestrictedDownloadError(message)) {
    return 'ageRestricted';
  }

  if (/private video|video is private|this video is private/i.test(message)) {
    return 'privateVideo';
  }

  if (/copyright (?:claim|restriction)|blocked.*copyright|copyright.*blocked/i.test(message)) {
    return 'copyrightRestricted';
  }

  if (/not available in your (?:country|region)|geo(?:graphically)?[- ]blocked/i.test(message)) {
    return 'regionRestricted';
  }

  if (/members[- ]only|premium content|join this channel|video requires access/i.test(message)) {
    return 'accessRequired';
  }

  if (
    /video unavailable|video is unavailable|video is not available|content isn't available|has been removed|deleted video|this video has been removed/i
      .test(message)
  ) {
    return 'unavailableVideo';
  }

  if (
    /no youtube match found|no contents found in search response|search returned no (?:result|track)/i
      .test(message)
  ) {
    return 'noMatch';
  }

  if (/no download url|missing final url|returned no final url/i.test(message)) {
    return 'noDownloadUrl';
  }

  if (
    /no compatible (?:aac|m4a)|incompatible (?:aac|m4a)|incompatible_download_mime|compatible m4a file|requested format is not available|no video formats found/i
      .test(message)
  ) {
    return 'noCompatibleAudio';
  }

  if (/\bHTTP 429\b|rate[- ]limit|too many requests|provider_rate_limited/i.test(message)) {
    return 'rateLimited';
  }

  if (/\bHTTP (?:404|410)\b|url is no longer available/i.test(message)) {
    return 'urlUnavailable';
  }

  if (/\bHTTP 5\d\d\b|service unavailable|bad gateway|source is temporarily unavailable/i.test(message)) {
    return 'sourceUnavailable';
  }

  if (/\bHTTP 401\b|unauthorized|source requires access/i.test(message)) {
    return 'authorizationRequired';
  }

  if (/sign in to confirm you(?:'|’)re not a bot|bot verification|youtube requires verification/i.test(message)) {
    return 'verificationRequired';
  }

  if (/provider_exhausted|\bHTTP 403\b|forbidden|rejected the download link|download link.*rejected/i.test(message)) {
    return 'rejectedLink';
  }

  if (/network request failed|network.*(?:lost|offline|connection)|timed? out|timeout|econn|enotfound/i.test(message)) {
    return 'network';
  }

  if (/download too small|invalid or blocked audio|likely blocked|returned an invalid or blocked/i.test(message)) {
    return 'invalidAudio';
  }

  if (/ffmpeg|aac conversion|conversion produced|transcod|audio conversion failed/i.test(message)) {
    return 'conversion';
  }

  if (/cannot read downloaded file|downloaded file not found|enoent|audio file could not be saved/i.test(message)) {
    return 'fileSave';
  }

  return 'unknown';
}

export function getDownloadFailureTranslationKey(error: unknown): DownloadFailureTranslationKey {
  return `failureReasons.${getDownloadFailureReason(error)}`;
}

export function toDownloadFailureMessage(error: unknown): string {
  const message = getRawFailureMessage(error);
  const reason = getDownloadFailureReason(message);
  if (reason !== 'unknown') {
    return DOWNLOAD_FAILURE_MESSAGES[reason];
  }

  const detail = getSafeFailureDetail(message);
  return detail
    ? `Download failed: ${detail}`
    : DOWNLOAD_FAILURE_MESSAGES.unknown;
}
