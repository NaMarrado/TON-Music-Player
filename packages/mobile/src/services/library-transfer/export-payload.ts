import type { ExportManifest, Track } from '@ton/core';
import { getAllPlaylists, getAllTracksForTransfer, getPlaylistTracks } from '../db-queries';
import type { LibraryExportResult, LibraryExportSelection, LibraryTransferProgress } from './shared';
import { buildExportArchiveFileName } from './shared';
import { yieldToUiAsync } from './file-helpers';
import { resolveExportBundleType } from './bundle-type';
import { buildExportLabel, preparePlaylistEntries, prepareTrackExports } from './export-helpers';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { getLibraryTransferDeviceName } from './platform-label';

export type MobileExportPayload = {
  bundleType: LibraryExportResult['bundleType'];
  exportFileName: string;
  manifest: ExportManifest;
  trackFiles: Array<{ filePath: string; archivePath: string }>;
  artworkFiles: Array<{ filePath: string; archivePath: string }>;
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
};

export async function buildExportPayload(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<MobileExportPayload> {
  throwIfLibraryTransferCancelled(shouldCancel);
  onProgress?.({ phase: 'preparing', current: 0, total: 1 });
  await yieldToUiAsync();
  throwIfLibraryTransferCancelled(shouldCancel);
  const allTracks = await getAllTracksForTransfer();
  const allPlaylists = await getAllPlaylists();
  const selectedPlaylistIds = new Set(selection.playlistIds);
  const selectedTrackIds = new Set(selection.trackIds ?? []);
  const selectedPlaylists = allPlaylists.filter((playlist) => selectedPlaylistIds.has(playlist.id));
  const bundleType = resolveExportBundleType(selection);
  const exportLabel = buildExportLabel(selection, selectedPlaylists.map((playlist) => playlist.name));
  const selectedTrackMap = new Map<number, Track>();
  const playlistTrackIdsByPlaylistId = new Map<number, number[]>();

  if (selection.includeLibrary) {
    for (const track of allTracks) selectedTrackMap.set(track.id, track);
  } else if (selectedTrackIds.size > 0) {
    for (const track of allTracks) {
      if (selectedTrackIds.has(track.id)) selectedTrackMap.set(track.id, track);
    }
  }
  for (const playlist of selectedPlaylists) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const playlistTracks = await getPlaylistTracks(playlist.id);
    playlistTrackIdsByPlaylistId.set(playlist.id, playlistTracks.map((track) => track.id));
    for (const track of playlistTracks) selectedTrackMap.set(track.id, track);
  }

  const { preparedByTrackId, preparedByHash } = await prepareTrackExports(
    [...selectedTrackMap.values()],
    onProgress,
    shouldCancel,
  );
  const { playlistEntries, playlistArtworkBySourceUri } = await preparePlaylistEntries(
    selectedPlaylists,
    playlistTrackIdsByPlaylistId,
    preparedByTrackId,
    onProgress,
    shouldCancel,
  );
  const preparedTracks = [...preparedByHash.values()];
  const trackEntries = preparedTracks.map((prepared) => prepared.trackEntry);
  const sizeBytes = preparedTracks.reduce((sum, prepared) => sum + prepared.sizeBytes, 0)
    + [...playlistArtworkBySourceUri.values()].reduce((sum, prepared) => sum + prepared.sizeBytes, 0);
  const manifest: ExportManifest = {
    version: 1,
    bundle_type: bundleType,
    created_at: Date.now(),
    device_name: getLibraryTransferDeviceName(),
    track_count: trackEntries.length,
    playlist_count: playlistEntries.length,
    total_size_bytes: sizeBytes,
    library_track_hashes: [...new Set(preparedTracks.map((prepared) => prepared.fileHash))],
    tracks: trackEntries,
    playlists: playlistEntries,
  };

  return {
    bundleType,
    exportFileName: buildExportArchiveFileName(exportLabel),
    manifest,
    trackFiles: preparedTracks.map((prepared) => ({
      filePath: prepared.sourceFileUri,
      archivePath: prepared.trackEntry.relative_path,
    })),
    artworkFiles: [...playlistArtworkBySourceUri.values()].map((prepared) => ({
      filePath: prepared.sourceFileUri,
      archivePath: prepared.archivePath,
    })),
    trackCount: trackEntries.length,
    playlistCount: playlistEntries.length,
    sizeBytes,
  };
}
