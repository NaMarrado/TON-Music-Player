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
