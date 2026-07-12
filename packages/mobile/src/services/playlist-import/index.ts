import type {
  LoadedPlaylistImport,
  PlaylistImportResult,
  PlaylistImportTrack,
} from '@ton/core';
import { ensureDownloadRuntimePermission } from '../download-runtime';
import { getDownloadQueue } from '../download-queue';
import type { DownloadInput } from '../downloader';
import { getExistingLibraryTrackIds } from '../../stores/download-store-helpers';
import { refreshPlaylistsById } from '../../stores/playlist-store';
import { replacePlaylistImportSnapshot } from './snapshot';
import { assignPlaylistImportTargets } from './targets';

function toDownloadInput(
  playlist: LoadedPlaylistImport & { source: 'spotify' | 'youtube' },
  track: PlaylistImportTrack,
): DownloadInput {
  return {
    album: track.album,
    artist: track.artist,
    coverUrl: playlist.source === 'youtube' ? track.coverUrl : null,
    durationMs: track.durationMs,
    playlistId: null,
    source: playlist.source,
    sourceId: track.sourceTrackId,
    sourceUrl: track.sourceUrl ?? playlist.sourceUrl,
    title: track.title,
  };
}

export async function importPlaylistToDownloads(
  playlist: LoadedPlaylistImport,
): Promise<PlaylistImportResult> {
  if (playlist.source === 'soundcloud') {
    throw new Error('invalid-playlist-url');
  }
  const mobilePlaylist = playlist as LoadedPlaylistImport & {
    source: 'spotify' | 'youtube';
  };
  const snapshot = await replacePlaylistImportSnapshot(mobilePlaylist);
  const queue = getDownloadQueue();
  await queue.resumeOnStartup();

  const inputByPosition = new Map(
    mobilePlaylist.tracks.map((track) => [
      track.position,
      toDownloadInput(mobilePlaylist, track),
    ]),
  );
  const inputs = [...inputByPosition.values()];
  const existingTrackIds = await getExistingLibraryTrackIds(inputs);
  const trackAssignments = new Map<number, number[]>();
  const queueAssignments = new Map<number, number[]>();
  const pendingBySource = new Map<string, {
    importItemIds: number[];
    input: DownloadInput;
  }>();

  for (const item of snapshot.items) {
    const input = inputByPosition.get(item.position);
    if (!input) {
      continue;
    }
    const sourceKey = `${input.source}:${input.sourceId}`;
    const existingTrackId = existingTrackIds[sourceKey];
    if (existingTrackId != null) {
      trackAssignments.set(existingTrackId, [
        ...(trackAssignments.get(existingTrackId) ?? []),
        item.id,
      ]);
      continue;
    }

    const duplicate = queue.findDuplicate(input);
    if (duplicate) {
      queueAssignments.set(duplicate.id, [
        ...(queueAssignments.get(duplicate.id) ?? []),
        item.id,
      ]);
      continue;
    }

    const pending = pendingBySource.get(sourceKey);
    if (pending) {
      pending.importItemIds.push(item.id);
    } else {
      pendingBySource.set(sourceKey, { importItemIds: [item.id], input });
    }
  }

  const lateExistingTrackIds = await getExistingLibraryTrackIds(
    [...pendingBySource.values()].map((entry) => entry.input),
  );
  for (const [sourceKey, pending] of pendingBySource) {
    const trackId = lateExistingTrackIds[sourceKey];
    if (trackId == null) {
      continue;
    }
    trackAssignments.set(trackId, [
      ...(trackAssignments.get(trackId) ?? []),
      ...pending.importItemIds,
    ]);
    pendingBySource.delete(sourceKey);
  }

  await assignPlaylistImportTargets({
    queue: [...queueAssignments].map(([queueId, importItemIds]) => ({
      importItemIds,
      queueId,
    })),
    tracks: [...trackAssignments].map(([trackId, importItemIds]) => ({
      importItemIds,
      trackId,
    })),
  }, [snapshot.importSourceId]);

  const pending = [...pendingBySource.values()];
  if (pending.length > 0) {
    await ensureDownloadRuntimePermission().catch(() => false);
    await queue.enqueueBatch(pending.map((entry) => entry.input), {
      onInserted: async (inserted) => {
        await assignPlaylistImportTargets({
          queue: inserted.map((row, index) => ({
            importItemIds: pending[index]?.importItemIds ?? [],
            queueId: row.id,
          })),
          tracks: [],
        });
      },
    });
  }

  await refreshPlaylistsById([snapshot.playlist.id]);

  return {
    alreadyQueuedCount: [...queueAssignments.values()]
      .reduce((total, itemIds) => total + itemIds.length, 0),
    linkedCount: [...trackAssignments.values()]
      .reduce((total, itemIds) => total + itemIds.length, 0),
    playlistId: snapshot.playlist.id,
    playlistName: snapshot.playlist.name,
    queuedCount: pending.reduce((total, entry) => total + entry.importItemIds.length, 0),
    totalCount: snapshot.items.length,
  };
}

export { settlePlaylistImportQueueItem } from './targets';
