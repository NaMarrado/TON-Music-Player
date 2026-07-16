import { DOWNLOAD_RETRY_DELAY_MS } from '@ton/core';

export function getRetryDelay(): number {
  return DOWNLOAD_RETRY_DELAY_MS;
}
