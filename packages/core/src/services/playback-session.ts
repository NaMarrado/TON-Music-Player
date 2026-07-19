import type {
  PlaybackQueueSourceDescriptor,
  PlaybackSessionSnapshot,
  QueueItem,
  QueueSource,
} from '../types/queue';

export const PLAYBACK_SESSION_SETTING_KEY = 'playback_session';

const QUEUE_SOURCES = new Set<QueueSource>(['user', 'auto', 'smart-playlist']);
const SOURCE_KINDS = new Set([
  'album',
  'artist',
  'custom',
  'library',
  'playlist',
  'selection',
  'single',
]);

export function parsePlaybackSessionSnapshot(value: unknown): PlaybackSessionSnapshot | null {
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) return null;
  const queue = parseQueue(parsed.queue);
  if (!queue.length) return null;

  const parsedCurrentIndex = toInteger(parsed.current_index);
  if (parsedCurrentIndex == null || parsedCurrentIndex < 0 || parsedCurrentIndex >= queue.length) {
    return null;
  }

  const sourceItems = parseQueue(parsed.source_items ?? parsed.original_queue);
  const validSourceItems = sourceItems.length ? sourceItems : [...queue];
  const normalized = normalizeActiveQueue(queue, validSourceItems, parsedCurrentIndex);

  const source = parseQueueSource(parsed.source);
  const sourceDescriptor = parseSourceDescriptor(parsed.source_descriptor);

  return {
    queue: normalized.queue,
    source_items: validSourceItems,
    next_queue_serial: Math.max(
      queue.length,
      toInteger(parsed.next_queue_serial) ?? queue.length,
    ),
    current_index: normalized.currentIndex,
    position_seconds: Math.max(0, toFiniteNumber(parsed.position_seconds) ?? 0),
    repeat: parsed.repeat === 'one' ? 'one' : 'all',
    shuffle: parsed.shuffle === true,
    source,
    source_descriptor: sourceDescriptor,
  };
}

function normalizeActiveQueue(
  queue: QueueItem[],
  sourceItems: QueueItem[],
  currentIndex: number,
): { queue: QueueItem[]; currentIndex: number } {
  const active = queue.length <= 20
    ? [...queue]
    : [...queue.slice(currentIndex), ...queue.slice(0, currentIndex)].slice(0, 20);
  const normalizedCurrentIndex = queue.length <= 20 ? currentIndex : 0;

  return {
    queue: active.map((item) => item.source_index != null
      ? item
      : {
        ...item,
        source_index: findSourceIndex(sourceItems, item),
      }),
    currentIndex: normalizedCurrentIndex,
  };
}

function findSourceIndex(sourceItems: QueueItem[], item: QueueItem): number {
  const byPlaylistMembership = item.playlist_track_id == null
    ? -1
    : sourceItems.findIndex((source) => source.playlist_track_id === item.playlist_track_id);
  if (byPlaylistMembership >= 0) return byPlaylistMembership;
  const byTrack = sourceItems.findIndex((source) => source.track_id === item.track_id);
  return Math.max(0, byTrack);
}

function parseQueue(value: unknown): QueueItem[] {
  if (!Array.isArray(value)) return [];
  const items: QueueItem[] = [];
  const ids = new Set<string>();

  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const trackId = toInteger(raw.track_id);
    const addedBy = parseQueueSource(raw.added_by);
    if (!id || ids.has(id) || trackId == null || trackId <= 0 || !addedBy) continue;

    const playlistTrackId = toInteger(raw.playlist_track_id);
    items.push({
      id,
      track_id: trackId,
      added_by: addedBy,
      ...(playlistTrackId != null && playlistTrackId > 0
        ? { playlist_track_id: playlistTrackId }
        : {}),
      ...(toInteger(raw.source_index) != null && toInteger(raw.source_index)! >= 0
        ? { source_index: toInteger(raw.source_index)! }
        : {}),
    });
    ids.add(id);
  }

  return items;
}

function parseQueueSource(value: unknown): QueueSource | null {
  return typeof value === 'string' && QUEUE_SOURCES.has(value as QueueSource)
    ? value as QueueSource
    : null;
}

function parseSourceDescriptor(value: unknown): PlaybackQueueSourceDescriptor | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || !SOURCE_KINDS.has(value.kind)) {
    return null;
  }

  return {
    kind: value.kind as PlaybackQueueSourceDescriptor['kind'],
    ...(typeof value.source_id === 'string' || typeof value.source_id === 'number'
      ? { source_id: value.source_id }
      : {}),
    ...(typeof value.filter_query === 'string' ? { filter_query: value.filter_query } : {}),
    ...(typeof value.sort_by === 'string' ? { sort_by: value.sort_by } : {}),
    ...(value.sort_order === 'asc' || value.sort_order === 'desc'
      ? { sort_order: value.sort_order }
      : {}),
  };
}

function toInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
