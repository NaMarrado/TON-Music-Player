import {
  DOWNLOAD_DELAY_MAX_MS,
  DOWNLOAD_DELAY_MIN_MS,
  DOWNLOAD_RETRY_DELAY_MS,
} from '@ton/core';

const MAX_BACKOFF_MS = 120_000;

function randomDelay(): number {
  return DOWNLOAD_DELAY_MIN_MS +
    Math.random() * (DOWNLOAD_DELAY_MAX_MS - DOWNLOAD_DELAY_MIN_MS);
}

export function getRetryDelay(retryCount: number): number {
  return DOWNLOAD_RETRY_DELAY_MS * retryCount;
}

export function getScheduleDelay(
  activeCount: number,
  consecutiveErrors: number,
): number {
  const backoffMs =
    consecutiveErrors > 0
      ? Math.min(randomDelay() * Math.pow(2, consecutiveErrors), MAX_BACKOFF_MS)
      : 0;

  if (activeCount === 0 && backoffMs === 0) {
    return 0;
  }

  return Math.max(randomDelay(), backoffMs);
}
