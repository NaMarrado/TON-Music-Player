import fs from 'fs';
import path from 'path';
import { getDb } from '../../services/database';
import { hashFileSha256 } from '../../services/cloud-sync/hash';
import type {
  ExportBundleData,
  ExportSummaryResult,
  PreparedArtworkFile,
  ExportPlaylistRow,
  ExportTrackRow,
} from './types';

export type ExportSelection = {
  includeLibrary?: boolean;
  playlistIds?: number[];
};

type ExportableTrackRow = ExportTrackRow & {
  archivePath: string;
  content_hash_sha256: string;
  file_hash: string;
};

type SelectedExportRows = {
  allTracks: ExportTrackRow[];
  membershipsByPlaylistId: Map<number, number[]>;
  playlists: ExportPlaylistRow[];
  selectedTrackIds: Set<number>;
};

function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function earliestDownloadedAt(
  left: number | null,
  right: number | null,
): number | null {
  const normalizedLeft = normalizeDownloadedAt(left);
  const normalizedRight = normalizeDownloadedAt(right);
  if (normalizedLeft == null) {
    return normalizedRight;
  }
  if (normalizedRight == null) {
    return normalizedLeft;
  }
  return Math.min(normalizedLeft, normalizedRight);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function loadSelectedExportRows(selection?: ExportSelection): SelectedExportRows {
  const db = getDb();
  const includeLibrary = selection?.includeLibrary ?? true;
  const hasExplicitPlaylistSelection = selection?.playlistIds !== undefined;
  const selectedPlaylistIds = new Set(selection?.playlistIds ?? []);

  const allTracks = db.prepare(`
    SELECT id, file_path, file_hash, content_hash_sha256, downloaded_at,
           title, artist, album, genre, year,
           duration_ms, loudness_lufs, loudness_gain, cover_art_path, format
    FROM tracks
    ORDER BY id ASC
  `).all() as ExportTrackRow[];

  const allPlaylists = db.prepare(`
    SELECT id, name, description, cover_path, is_smart, smart_rules
    FROM playlists
    ORDER BY sort_order ASC, id ASC
  `).all() as ExportPlaylistRow[];

  const playlists = hasExplicitPlaylistSelection
    ? allPlaylists.filter((playlist) => selectedPlaylistIds.has(playlist.id))
    : allPlaylists;
  const selectedTrackIds = new Set<number>();
  const membershipsByPlaylistId = new Map<number, number[]>();

  if (includeLibrary) {
    for (const track of allTracks) {
      selectedTrackIds.add(track.id);
    }
  }

  const loadMemberships = db.prepare(`
    SELECT track_id
    FROM playlist_tracks
    WHERE playlist_id = ?
    ORDER BY position ASC, id ASC
  `);

  for (const playlist of playlists) {
    const trackIds = (loadMemberships.all(playlist.id) as Array<{ track_id: number }>)
      .map((row) => row.track_id);
    membershipsByPlaylistId.set(playlist.id, trackIds);
    for (const trackId of trackIds) {
      selectedTrackIds.add(trackId);
    }
  }

  return {
    allTracks,
    membershipsByPlaylistId,
    playlists,
    selectedTrackIds,
  };
}

export function getExportSummary(
  bundleData: Pick<ExportBundleData, 'trackEntries' | 'playlistEntries'>,
): ExportSummaryResult {
  return {
    exportableTrackCount: bundleData.trackEntries.length,
    exportablePlaylistCount: bundleData.playlistEntries.length,
  };
}

export function loadExportSourcePaths(selection?: ExportSelection): string[] {
  const {
    allTracks,
    playlists,
    selectedTrackIds,
  } = loadSelectedExportRows(selection);
  const sourcePaths = new Set<string>();

  for (const track of allTracks) {
    if (selectedTrackIds.has(track.id)) {
      sourcePaths.add(track.file_path);
    }
  }
  for (const playlist of playlists) {
    if (playlist.cover_path && fs.existsSync(playlist.cover_path)) {
      sourcePaths.add(playlist.cover_path);
    }
  }

  return [...sourcePaths];
}

export async function loadExportBundleData(selection?: ExportSelection): Promise<ExportBundleData> {
  const db = getDb();
  const {
    allTracks,
    membershipsByPlaylistId,
    playlists,
    selectedTrackIds,
  } = loadSelectedExportRows(selection);
  const exportableTrackById = new Map<number, ExportableTrackRow>();
  const exportableTrackByHash = new Map<string, ExportableTrackRow>();
  const updateTrackHashes = db.prepare(`
    UPDATE tracks
    SET file_hash = CASE
          WHEN file_hash IS NULL OR file_hash = '' THEN ?
          ELSE file_hash
        END,
        content_hash_sha256 = ?
    WHERE id = ?
  `);

  for (const track of allTracks) {
    if (!selectedTrackIds.has(track.id)) {
      continue;
    }
    if (!(await pathExists(track.file_path))) {
      throw new Error(`Cannot export missing Library file: ${track.file_path}`);
    }

    let contentHash = track.content_hash_sha256;
    if (!contentHash) {
      try {
        contentHash = await hashFileSha256(track.file_path);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot read Library file for export: ${track.file_path} (${detail})`);
      }
    }

    const fileHash = track.file_hash || contentHash;
    updateTrackHashes.run(fileHash, contentHash, track.id);
    let prepared = exportableTrackByHash.get(fileHash);
    if (!prepared) {
      prepared = {
        ...track,
        downloaded_at: normalizeDownloadedAt(track.downloaded_at),
        archivePath: `tracks/${fileHash}${path.extname(track.file_path)}`,
        content_hash_sha256: contentHash,
        file_hash: fileHash,
      };
      exportableTrackByHash.set(fileHash, prepared);
    } else {
      prepared.downloaded_at = earliestDownloadedAt(
        prepared.downloaded_at,
        track.downloaded_at,
      );
    }
    exportableTrackById.set(track.id, prepared);
  }

  const artworkFileBySourcePath = new Map<string, PreparedArtworkFile>();
  const playlistEntries = await Promise.all(playlists.map(async (playlist) => {
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
      track_hashes: (membershipsByPlaylistId.get(playlist.id) ?? [])
        .map((trackId) => exportableTrackById.get(trackId)?.file_hash ?? null)
        .filter((value): value is string => Boolean(value)),
    };
  }));

  const tracks = [...exportableTrackByHash.values()];
  const trackEntries: ExportBundleData['trackEntries'] = tracks.map((track) => ({
    file_hash: track.file_hash,
    content_hash_sha256: track.content_hash_sha256,
    downloaded_at: normalizeDownloadedAt(track.downloaded_at),
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
  }));
  const trackFiles: ExportBundleData['trackFiles'] = tracks.map((track) => ({
    filePath: track.file_path,
    archivePath: track.archivePath,
  }));

  return {
    libraryTrackHashes: tracks.map((track) => track.file_hash),
    trackEntries,
    playlistEntries,
    trackFiles,
    artworkFiles: [...artworkFileBySourcePath.values()],
  };
}

export async function loadExportSummary(selection?: ExportSelection): Promise<ExportSummaryResult> {
  const { playlists, selectedTrackIds } = loadSelectedExportRows(selection);
  return {
    exportableTrackCount: selectedTrackIds.size,
    exportablePlaylistCount: playlists.length,
  };
}
