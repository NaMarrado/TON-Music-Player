import type { YouTubePlaylistTrack } from '../types/download';

type UnknownRecord = Record<string, unknown>;

export function parseYouTubePlaylistItem(item: unknown): YouTubePlaylistTrack | null {
  const data = asRecord(item);
  if (!data) return null;

  if (data.type === 'LockupView' && data.content_type !== 'VIDEO') {
    return null;
  }

  const youtubeId = readString(data.id)
    ?? readString(data.content_id)
    ?? readString(data.video_id);
  if (!youtubeId) return null;

  const metadata = asRecord(data.metadata);
  const title = readText(data.title) ?? readText(metadata?.title) ?? '';
  const artist = readText(asRecord(data.author)?.name)
    ?? readLockupArtist(metadata)
    ?? '';

  return {
    youtube_id: youtubeId,
    title,
    artist,
    duration_ms: readDurationMs(data),
    cover_url: readThumbnailUrl(data),
  };
}

function readLockupArtist(metadata: UnknownRecord | null): string | null {
  const contentMetadata = asRecord(metadata?.metadata);
  const firstRow = asArray(contentMetadata?.metadata_rows)[0];
  const firstPart = asArray(asRecord(firstRow)?.metadata_parts)[0];
  return readText(asRecord(firstPart)?.text);
}

function readDurationMs(data: UnknownRecord): number {
  const seconds = asRecord(data.duration)?.seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const contentImage = asRecord(data.content_image);
  for (const overlay of asArray(contentImage?.overlays)) {
    const overlayData = asRecord(overlay);
    if (overlayData?.type !== 'ThumbnailBottomOverlayView') continue;

    for (const badge of asArray(overlayData.badges)) {
      const durationMs = parseDurationText(readString(asRecord(badge)?.text));
      if (durationMs !== null) return durationMs;
    }
  }

  return 0;
}

function parseDurationText(value: string | null): number | null {
  if (!value || !/^\d+(?::\d+){1,2}$/.test(value)) return null;

  const seconds = value
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
  return seconds * 1000;
}

function readThumbnailUrl(data: UnknownRecord): string | null {
  const legacyThumbnails = asArray(data.thumbnails);
  const contentImage = asRecord(data.content_image);
  const lockupThumbnails = asArray(contentImage?.image);

  const candidates = [...legacyThumbnails, ...lockupThumbnails]
    .map(asRecord)
    .filter((thumbnail): thumbnail is UnknownRecord => thumbnail !== null)
    .map((thumbnail) => ({
      url: readString(thumbnail.url),
      area: readNumber(thumbnail.width) * readNumber(thumbnail.height),
    }))
    .filter((thumbnail): thumbnail is { url: string; area: number } => thumbnail.url !== null)
    .sort((left, right) => right.area - left.area);

  return candidates[0]?.url ?? null;
}

function readText(value: unknown): string | null {
  const direct = readString(value);
  if (direct !== null) return direct;

  const data = asRecord(value);
  if (!data) return null;

  return readString(data.text) ?? readString(data.content);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object'
    ? value as UnknownRecord
    : null;
}
