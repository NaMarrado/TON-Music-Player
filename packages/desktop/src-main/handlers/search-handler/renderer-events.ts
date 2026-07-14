import type { SearchSourceEvent } from '@ton/core';

export function sendSearchSourceEvent(
  target: Electron.WebContents,
  payload: SearchSourceEvent,
): void {
  if (!target.isDestroyed()) {
    target.send('search:source-results', payload);
  }
}
