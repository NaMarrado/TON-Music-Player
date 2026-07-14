import type { Track } from '../types';
import { formatSize } from './format-size';

export interface TrackFileSizeSummary {
  knownBytes: number;
  uniqueTrackCount: number;
  unknownCount: number;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDownloadedDate(
  downloadedAt: number | null | undefined,
  locale?: string,
): string {
  if (downloadedAt == null || !Number.isFinite(downloadedAt) || downloadedAt <= 0) {
    return '—';
  }

  const normalizedLocale = locale?.trim() || 'en';
  let formatter = dateFormatters.get(normalizedLocale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(normalizedLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    dateFormatters.set(normalizedLocale, formatter);
  }

  return formatter.format(new Date(downloadedAt * 1000));
}

export function summarizeTrackFileSizes(
  tracks: readonly Pick<Track, 'id' | 'file_size'>[],
): TrackFileSizeSummary {
  const seenTrackIds = new Set<number>();
  let knownBytes = 0;
  let unknownCount = 0;

  for (const track of tracks) {
    if (seenTrackIds.has(track.id)) {
      continue;
    }
    seenTrackIds.add(track.id);

    if (track.file_size == null || !Number.isFinite(track.file_size) || track.file_size < 0) {
      unknownCount += 1;
      continue;
    }
    knownBytes += track.file_size;
  }

  return {
    knownBytes,
    uniqueTrackCount: seenTrackIds.size,
    unknownCount,
  };
}

export function formatTrackFileSizeSummary(summary: TrackFileSizeSummary): string {
  if (summary.uniqueTrackCount === 0) {
    return formatSize(0);
  }
  if (summary.unknownCount === summary.uniqueTrackCount) {
    return '—';
  }

  const formatted = formatSize(summary.knownBytes);
  return summary.unknownCount > 0 ? `≥ ${formatted}` : formatted;
}
