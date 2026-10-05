import * as FileSystem from 'expo-file-system';
import type { ExportTrackEntry, Track, ExportManifest } from '@ton/core';
import type { Playlist } from '@ton/core';
import { runMobileCloudDbLane } from '../cloud-sync/db-lane';
import { hashFileSha256 } from '../cloud-sync/hash';
import {
  buildExportTrackFileName,
  EXPORT_ARTWORK_DIR_NAME,
  getFileExtension,
} from './naming';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { yieldToUiAsync } from './file-helpers';
import type { LibraryExportSelection, LibraryTransferProgress } from './types';

export interface PreparedTrackExport {
  fileHash: string;
  sourceFileUri: string;
  sizeBytes: number;
  trackEntry: ExportTrackEntry;
}

export interface PreparedPlaylistArtworkExport {
  sourceFileUri: string;
  archivePath: string;
  sizeBytes: number;
}

export function buildExportLabel(
  selection: LibraryExportSelection,
  playlistNames: string[],
): string {
  const selectedTrackCount = selection.trackIds?.length ?? 0;
  if (!selection.includeLibrary && playlistNames.length === 0 && selectedTrackCount > 0) {
    return selectedTrackCount === 1 ? 'Track' : `${selectedTrackCount} tracks`;
  }
  if (selection.includeLibrary && playlistNames.length === 0) {
    return 'Library';
  }

  if (!selection.includeLibrary && playlistNames.length === 1) {
    return playlistNames[0];
  }

  if (!selection.includeLibrary) {
    return `${playlistNames.length} playlists`;
  }

  if (playlistNames.length === 1) {
    return `Library + ${playlistNames[0]}`;
  }

  return `Library + ${playlistNames.length} playlists`;
}

function resolveTrackExtension(track: Track): string {
  const fromPath = getFileExtension(track.file_path);
  if (fromPath) {
    return fromPath;
  }

  switch (track.format) {
    case 'mp3':
      return '.mp3';
    case 'flac':
      return '.flac';
    case 'wav':
      return '.wav';
    case 'ogg':
      return '.ogg';
    case 'aac':
      return '.aac';
    case 'm4a':
      return '.m4a';
    case 'webm':
      return '.webm';
    case 'opus':
      return '.opus';
    default:
      return '';
  }
}

function normalizeDownloadedAt(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function earliestDownloadedAt(
  current: number | null | undefined,
  incoming: number | null,
): number | null {
  const normalizedCurrent = normalizeDownloadedAt(current ?? null);
  if (normalizedCurrent == null) return incoming;
  if (incoming == null) return normalizedCurrent;
  return Math.min(normalizedCurrent, incoming);
}

async function saveTrackHashes(hashes: Array<{ id: number; fileHash: string; contentHash: string }>): Promise<void> {
  await runMobileCloudDbLane((db) => db.withTransactionAsync(async () => {
    for (const { id, fileHash, contentHash } of hashes) {
      await db.runAsync('UPDATE tracks SET file_hash = ?, content_hash_sha256 = ? WHERE id = ?', [fileHash, contentHash, id]);
    }
  }));

}

export async function prepareTrackExports(
  tracks: Track[],
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<{
  preparedByTrackId: Map<number, PreparedTrackExport>;
  preparedByHash: Map<string, PreparedTrackExport>;
}> {
  const preparedByTrackId = new Map<number, PreparedTrackExport>();
  const preparedByHash = new Map<string, PreparedTrackExport>();

  onProgress?.({ phase: 'tracks', current: 0, total: tracks.length });
  const newHashes: Array<{ id: number; fileHash: string; contentHash: string }> = [];

  for (let index = 0; index < tracks.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const track = tracks[index];
    const info = await FileSystem.getInfoAsync(track.file_path, { size: true });
    if (!info.exists) {
      throw new Error(`Cannot export missing Library file: ${track.file_path}`);
    }

    const contentHash = track.content_hash_sha256 || await hashFileSha256(track.file_path);
    const fileHash = track.file_hash || contentHash;
    if (track.file_hash !== fileHash || track.content_hash_sha256 !== contentHash) {
      newHashes.push({ id: track.id, fileHash, contentHash });
    }

    let prepared = preparedByHash.get(fileHash);
    if (!prepared) {
      const ext = resolveTrackExtension(track);
      const exportFileName = buildExportTrackFileName(fileHash, ext);

      prepared = {
        fileHash,
        sourceFileUri: track.file_path,
        sizeBytes: typeof info.size === 'number' ? info.size : 0,
        trackEntry: {
          file_hash: fileHash,
          content_hash_sha256: contentHash,
          downloaded_at: normalizeDownloadedAt(track.downloaded_at),
          relative_path: `tracks/${exportFileName}`,
          metadata: {
            title: track.title,
            artist: track.artist,
            album: track.album,
            genre: track.genre,
            year: track.year,
            duration_ms: track.duration_ms,
            loudness_lufs: track.loudness_lufs,
            loudness_gain: track.loudness_gain,
          },
        },
      };

      preparedByHash.set(fileHash, prepared);
    } else {
      prepared.trackEntry.downloaded_at = earliestDownloadedAt(
        prepared.trackEntry.downloaded_at,
        normalizeDownloadedAt(track.downloaded_at),
      );
    }

    preparedByTrackId.set(track.id, prepared);
    onProgress?.({ phase: 'tracks', current: index + 1, total: tracks.length });
    if ((index + 1) % 5 === 0) {
      await yieldToUiAsync();
      throwIfLibraryTransferCancelled(shouldCancel);
    }
  }

  // The hashes only save work next time. They are stored together at the end, so a busy database (a sync writing) costs
  // one wait instead of one per song, and never stops the export.
  if (newHashes.length > 0) {
    await saveTrackHashes(newHashes).catch((error: unknown) => console.warn('[library-transfer] Could not store song hashes', error));
  }

  return { preparedByTrackId, preparedByHash };
}

export async function preparePlaylistEntries(
  playlists: Playlist[],
  playlistTrackIdsByPlaylistId: Map<number, number[]>,
  preparedByTrackId: Map<number, PreparedTrackExport>,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<{
  playlistEntries: ExportManifest['playlists'];
  playlistArtworkBySourceUri: Map<string, PreparedPlaylistArtworkExport>;
}> {
  const playlistEntries: ExportManifest['playlists'] = [];
  const playlistArtworkBySourceUri = new Map<string, PreparedPlaylistArtworkExport>();

  onProgress?.({ phase: 'playlists', current: 0, total: playlists.length });

  for (let index = 0; index < playlists.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const playlist = playlists[index];
    const trackHashes = (playlistTrackIdsByPlaylistId.get(playlist.id) ?? [])
      .map((trackId) => preparedByTrackId.get(trackId)?.fileHash)
      .filter((value): value is string => Boolean(value));

    let coverRelativePath: string | null = null;
    if (playlist.cover_path) {
      const coverInfo = await FileSystem.getInfoAsync(playlist.cover_path, { size: true });
      if (coverInfo.exists) {
        let preparedArtwork = playlistArtworkBySourceUri.get(playlist.cover_path);
        if (!preparedArtwork) {
          const ext = getFileExtension(playlist.cover_path) || '.jpg';
          preparedArtwork = {
            sourceFileUri: playlist.cover_path,
            archivePath: `${EXPORT_ARTWORK_DIR_NAME}/playlist-${playlist.id}${ext}`,
            sizeBytes: typeof coverInfo.size === 'number' ? coverInfo.size : 0,
          };
          playlistArtworkBySourceUri.set(playlist.cover_path, preparedArtwork);
        }
        coverRelativePath = preparedArtwork.archivePath;
      }
    }

    playlistEntries.push({
      name: playlist.name,
      description: playlist.description,
      cover_relative_path: coverRelativePath,
      is_smart: playlist.is_smart,
      smart_rules: playlist.smart_rules,
      track_hashes: trackHashes,
    });

    onProgress?.({ phase: 'playlists', current: index + 1, total: playlists.length });
    if ((index + 1) % 3 === 0) {
      await yieldToUiAsync();
      throwIfLibraryTransferCancelled(shouldCancel);
    }
  }

  return {
    playlistEntries,
    playlistArtworkBySourceUri,
  };
}
