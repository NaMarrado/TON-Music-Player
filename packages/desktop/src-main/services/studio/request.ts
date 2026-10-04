import type { DownloadSource } from '@ton/core';
import type { StudioTempDownloadRequest } from '../../../src/shared/studio-ipc';

const SOURCES: Record<DownloadSource, true> = { youtube: true, spotify: true, soundcloud: true };

/** Accepts only the fields and values a temporary download may use; anything else from the renderer is dropped. */
export function parseTempDownloadRequest(value: unknown): StudioTempDownloadRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid download request');
  const source = 'source' in value ? value.source : undefined;
  const url = 'url' in value ? value.url : undefined;
  const title = 'title' in value ? value.title : undefined;
  const artist = 'artist' in value ? value.artist : undefined;
  const durationMs = 'durationMs' in value ? value.durationMs : undefined;
  if (typeof source !== 'string' || !(source in SOURCES)) throw new Error('Unsupported source');
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Invalid download address');
  return {
    source: source as DownloadSource,
    url,
    title: typeof title === 'string' ? title.slice(0, 300) : '',
    artist: typeof artist === 'string' ? artist.slice(0, 300) : '',
    durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : null,
  };
}
