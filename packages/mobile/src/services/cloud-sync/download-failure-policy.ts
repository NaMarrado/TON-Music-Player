export const CLOUD_DOWNLOAD_RETRY_BASE_SECONDS = 30;
export const CLOUD_DOWNLOAD_RETRY_MAX_SECONDS = 15 * 60;

export function getCloudDownloadRetryDelaySeconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(10, Math.floor(attemptCount) - 1));
  return Math.min(
    CLOUD_DOWNLOAD_RETRY_MAX_SECONDS,
    CLOUD_DOWNLOAD_RETRY_BASE_SECONDS * (2 ** exponent),
  );
}

export function shouldDeferCloudTrackDownload(input: {
  retryFailed: boolean;
  hasLocalAudio: boolean;
  contentHash: string;
  failedHashes: ReadonlySet<string>;
}): boolean {
  return !input.retryFailed
    && !input.hasLocalAudio
    && input.failedHashes.has(input.contentHash);
}
