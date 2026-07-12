import fs from 'fs';
import path from 'path';
import { getDb } from '../../services/database';
import type {
  ExportBundleData,
  ExportSummaryResult,
  PreparedArtworkFile,
  ExportPlaylistRow,
  ExportTrackRow,
  PlaylistTrackHashRow,
} from './types';

type ExportSelection = {
  includeLibrary?: boolean;
  playlistIds?: number[];
};

type ExportableTrackRow = ExportTrackRow & {
  archivePath: string;
  file_hash: string;
  in_library: number;
};

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function getExportSummary(bundleData: Pick<ExportBundleData, 'trackEntries' | 'playlistEntries'>): ExportSummaryResult {
  return {
    exportableTrackCount: bundleData.trackEntries.length,
    exportablePlaylistCount: bundleData.playlistEntries.length,
  };
}

export async function loadExportBundleData(selection?: ExportSelection): Promise<ExportBundleData> {
  const db = getDb();
  const includeLibrary = selection?.includeLibrary ?? true;
  const hasExplicitPlaylistSelection = selection?.playlistIds !== undefined;
  const selectedPlaylistIds = new Set(selection?.playlistIds ?? []);

  const allTracks = db.prepare(`
    SELECT id, file_path, file_hash, title, artist, album, genre, year,
           duration_ms, loudness_lufs, loudness_gain, cover_art_path, format, in_library
    FROM tracks
  `).all() as (ExportTrackRow & { in_library: number })[];

  const allPlaylists = db.prepare(`
    SELECT id, name, description, cover_path, is_smart, smart_rules FROM playlists
  `).all() as ExportPlaylistRow[];

  const playlists = hasExplicitPlaylistSelection
    ? allPlaylists.filter((playlist) => selectedPlaylistIds.has(playlist.id))
    : allPlaylists;

  const selectedTrackIds = new Set<number>();

  if (includeLibrary) {
    for (const track of allTracks) {
      if (track.in_library === 1) {
        selectedTrackIds.add(track.id);
      }
    }
  }

  const exportableTrackById = new Map<number, ExportableTrackRow>();
  await Promise.all(allTracks.map(async (track) => {
    const fileHash = track.file_hash;
    if (!fileHash || !(await pathExists(track.file_path))) {
      return;
    }

    exportableTrackById.set(track.id, {
      ...track,
      file_hash: fileHash,
      archivePath: `tracks/${fileHash}${path.extname(track.file_path)}`,
    });
  }));

  const artworkFileBySourcePath = new Map<string, PreparedArtworkFile>();
  const playlistEntries = await Promise.all(playlists.map(async (playlist) => {
    const trackHashes = db.prepare(`
      SELECT t.id, t.file_hash FROM playlist_tracks pt
      JOIN tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position
    `).all(playlist.id) as Array<PlaylistTrackHashRow & { id: number }>;

    for (const row of trackHashes) {
      selectedTrackIds.add(row.id);
    }

    let coverRelativePath: string | null = null;
    if (playlist.cover_path && await pathExists(playlist.cover_path)) {
      let artworkFile = artworkFileBySourcePath.get(playlist.cover_path);
      if (!artworkFile) {
        const ext = path.extname(playlist.cover_path) || '.jpg';
        artworkFile = {
          filePath: playlist.cover_path,
          archivePath: `artwork/playlist-${playlist.id}${ext}`,
        };
        artworkFileBySourcePath.set(playlist.cover_path, artworkFile);
      }
      coverRelativePath = artworkFile.archivePath;
    }

    return {
      name: playlist.name,
      description: playlist.description,
      cover_relative_path: coverRelativePath,
      is_smart: playlist.is_smart === 1,
      smart_rules: playlist.smart_rules,
      track_hashes: trackHashes
        .filter((row) => row.file_hash && exportableTrackById.has(row.id))
        .map((row) => row.file_hash as string),
    };
  }));

  const tracks = [...selectedTrackIds]
    .map((trackId) => exportableTrackById.get(trackId) ?? null)
    .filter((track): track is ExportableTrackRow => Boolean(track));

  const libraryTrackHashes = includeLibrary
    ? tracks
      .filter((track) => track.in_library === 1)
      .map((track) => track.file_hash)
      .filter((value): value is string => Boolean(value))
    : [];

  const trackEntries: ExportBundleData['trackEntries'] = [];
  const trackFiles: ExportBundleData['trackFiles'] = [];

  for (const track of tracks) {
    trackEntries.push({
      file_hash: track.file_hash,
      relative_path: track.archivePath,
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
    });

    trackFiles.push({ filePath: track.file_path, archivePath: track.archivePath });
  }

  const artworkFiles: PreparedArtworkFile[] = [];
  for (const artworkFile of artworkFileBySourcePath.values()) {
    if (await pathExists(artworkFile.filePath)) {
      artworkFiles.push(artworkFile);
    }
  }

  return {
    libraryTrackHashes: [...new Set(libraryTrackHashes)],
    trackEntries,
    playlistEntries,
    trackFiles,
    artworkFiles,
  };
}

export async function loadExportSummary(selection?: ExportSelection): Promise<ExportSummaryResult> {
  return getExportSummary(await loadExportBundleData(selection));
}
