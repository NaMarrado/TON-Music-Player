import { DOWNLOAD_DELAY_MAX_MS, DOWNLOAD_DELAY_MIN_MS } from '@ton/core';

export function randomDelay(): number {
  return DOWNLOAD_DELAY_MIN_MS + Math.random() * (DOWNLOAD_DELAY_MAX_MS - DOWNLOAD_DELAY_MIN_MS);
}

export function getBackoffDelay(consecutiveErrors: number): number {
  const baseDelay = randomDelay();
  if (consecutiveErrors === 0) {
    return baseDelay;
  }

  return Math.min(baseDelay * Math.pow(2, consecutiveErrors), 120_000);
}
