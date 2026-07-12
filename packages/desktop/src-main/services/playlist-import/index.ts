import type {
  DownloadItem,
  DownloadRequest,
  LoadedPlaylistImport,
  PlaylistImportResult,
  PlaylistImportTrack,
} from '@ton/core';
import { getDownloadQueue } from '../download-queue';
import { getDb } from '../database';
import { replaceDesktopPlaylistImportSnapshot } from './snapshot';
import {
  assignDesktopPlaylistImportQueues,
  assignDesktopPlaylistImportTracks,
  materializeDesktopPlaylistImport,
} from './targets';

function sourceKey(source: LoadedPlaylistImport['source'], sourceId: string): string {
  return `${source}:${sourceId}`;
}

function getExistingTrackIds(playlist: LoadedPlaylistImport): Map<string, number> {
  const db = getDb();
  const sourceColumn = playlist.source === 'spotify'
    ? 'spotify_id'
    : playlist.source === 'soundcloud'
      ? 'soundcloud_id'
      : 'youtube_id';
  const result = new Map<string, number>();
  const sourceIds = [...new Set(playlist.tracks.map((track) => track.sourceTrackId))];

  for (let offset = 0; offset < sourceIds.length; offset += 500) {
    const chunk = sourceIds.slice(offset, offset + 500);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT id, ${sourceColumn} AS source_id
       FROM tracks
       WHERE ${sourceColumn} IN (${placeholders})`,
    ).all(...chunk) as Array<{ id: number; source_id: string }>;
    for (const row of rows) {
      result.set(sourceKey(playlist.source, row.source_id), row.id);
    }
  }
  return result;
}

function toDownloadRequest(
  playlist: LoadedPlaylistImport,
  track: PlaylistImportTrack,
  format: 'mp3' | 'opus',
): DownloadRequest {
  return {
    album: track.album ?? undefined,
    artist: track.artist,
    cover_url: playlist.source === 'spotify' ? undefined : track.coverUrl ?? undefined,
    duration_ms: track.durationMs,
    format,
    source: playlist.source,
    source_id: track.sourceTrackId,
    title: track.title,
    url: playlist.source === 'youtube'
      ? `https://www.youtube.com/watch?v=${track.sourceTrackId}`
      : track.sourceUrl ?? undefined,
  };
}

function findActiveDuplicate(
  items: DownloadItem[],
  playlist: LoadedPlaylistImport,
  sourceId: string,
): DownloadItem | null {
  return items.find((item) => (
    item.source === playlist.source
    && item.source_id === sourceId
    && ['pending', 'resolving', 'downloading', 'converting'].includes(item.status)
  )) ?? null;
}

export async function importDesktopPlaylistToDownloads(
  playlist: LoadedPlaylistImport,
  format: 'mp3' | 'opus',
): Promise<PlaylistImportResult> {
  const snapshot = await replaceDesktopPlaylistImportSnapshot(playlist);
  const queue = getDownloadQueue();
  const existingTrackIds = getExistingTrackIds(playlist);
  const queueItems = queue.getAll();
  const inputByPosition = new Map(playlist.tracks.map((track) => [track.position, track]));
  const trackAssignments = new Map<number, number[]>();
  const queueAssignments = new Map<number, number[]>();
  const pendingBySource = new Map<string, {
    importItemIds: number[];
    request: DownloadRequest;
  }>();

  for (const item of snapshot.items) {
    const track = inputByPosition.get(item.position);
    if (!track) {
      continue;
    }
    const key = sourceKey(playlist.source, track.sourceTrackId);
    const trackId = existingTrackIds.get(key);
    if (trackId != null) {
      trackAssignments.set(trackId, [...(trackAssignments.get(trackId) ?? []), item.id]);
      continue;
    }

    const duplicate = findActiveDuplicate(queueItems, playlist, track.sourceTrackId);
    if (duplicate) {
      queueAssignments.set(duplicate.id, [
        ...(queueAssignments.get(duplicate.id) ?? []),
        item.id,
      ]);
      continue;
    }

    const pending = pendingBySource.get(key);
    if (pending) {
      pending.importItemIds.push(item.id);
    } else {
      pendingBySource.set(key, {
        importItemIds: [item.id],
        request: toDownloadRequest(playlist, track, format),
      });
    }
  }

  assignDesktopPlaylistImportTracks(
    [...trackAssignments].map(([trackId, importItemIds]) => ({ importItemIds, trackId })),
  );
  assignDesktopPlaylistImportQueues(
    [...queueAssignments].map(([queueId, importItemIds]) => ({ importItemIds, queueId })),
  );

  const lateExistingTrackIds = getExistingTrackIds(playlist);
  const lateTrackAssignments: Array<{ importItemIds: number[]; trackId: number }> = [];
  for (const [key, pending] of pendingBySource) {
    const trackId = lateExistingTrackIds.get(key);
    if (trackId == null) {
      continue;
    }
    trackAssignments.set(trackId, [
      ...(trackAssignments.get(trackId) ?? []),
      ...pending.importItemIds,
    ]);
    lateTrackAssignments.push({ importItemIds: pending.importItemIds, trackId });
    pendingBySource.delete(key);
  }
  assignDesktopPlaylistImportTracks(lateTrackAssignments);
  await materializeDesktopPlaylistImport(snapshot.importSourceId);

  const pending = [...pendingBySource.values()];
  for (const entry of pending) {
    const queueId = queue.enqueue(entry.request);
    assignDesktopPlaylistImportQueues([{ importItemIds: entry.importItemIds, queueId }]);
  }

  return {
    alreadyQueuedCount: [...queueAssignments.values()]
      .reduce((total, ids) => total + ids.length, 0),
    linkedCount: [...trackAssignments.values()]
      .reduce((total, ids) => total + ids.length, 0),
    playlistId: snapshot.playlist.id,
    playlistName: snapshot.playlist.name,
    queuedCount: pending.reduce((total, entry) => total + entry.importItemIds.length, 0),
    totalCount: snapshot.items.length,
  };
}

export { settleDesktopPlaylistImportQueueItem } from './targets';
