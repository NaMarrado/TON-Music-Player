import type { DownloadStatus } from '@ton/core';

export const STATUS_KEYS: Record<DownloadStatus, string> = {
  pending: 'pending',
  resolving: 'resolving',
  downloading: 'downloading',
  converting: 'converting',
  done: 'done',
  error: 'error',
  cancelled: 'cancelled',
};

export const SOURCE_COLORS: Record<string, string> = {
  youtube: '#ff4444',
  spotify: '#1db954',
  soundcloud: '#ff7700',
};
