import type { ExportManifest } from '@ton/core';
import path from 'path';
import { getDb } from '../../../services/database';
import { getArtworkDir } from '../../../services/metadata-reader/artwork';
import type { ImportPreparedFile, ProgressPayload } from '../types';

export type InsertImportedLibraryResult = {
  importedPlaylists: number;
  playlistIds: number[];
};

export function insertImportedLibrary(
  manifest: ExportManifest,
  filesToInsert: ImportPreparedFile[],
  sendProgress: (data: ProgressPayload) => void,
): InsertImportedLibraryResult {
  const db = getDb();
  const bundleType = manifest.bundle_type === 'playlist'
    ? 'playlist'
    : (manifest.bundle_type === 'library'
      ? 'library'
      : (manifest.library_track_hashes !== undefined && manifest.library_track_hashes.length === 0 && manifest.playlists.length > 0
        ? 'playlist'
        : 'library'));
  const libraryTrackHashes = new Set(
    bundleType === 'playlist'
      ? (manifest.library_track_hashes ?? [])
      : (manifest.library_track_hashes && manifest.library_track_hashes.length > 0
        ? manifest.library_track_hashes
        : manifest.tracks.map((track) => track.file_hash)),
  );
  const insertTrack = db.prepare(`
    INSERT INTO tracks (
      file_path, file_hash, title, artist, album,
      genre, year, duration_ms, loudness_lufs, loudness_gain, in_library
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markTrackInLibrary = db.prepare('UPDATE tracks SET in_library = 1 WHERE file_hash = ?');
  const insertPlaylist = db.prepare(
    'INSERT INTO playlists (name, description, cover_path, is_smart, smart_rules) VALUES (?, ?, ?, ?, ?)',
  );
  const insertPlaylistTrack = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
  );
  const lookupTrackByHash = db.prepare('SELECT id FROM tracks WHERE file_hash = ?');

  let importedPlaylists = 0;
  const playlistIds: number[] = [];
  sendProgress({ phase: 'playlists', current: 0, total: manifest.playlists.length });

  const runImport = db.transaction(() => {
    for (const file of filesToInsert) {
      insertTrack.run(
        file.destPath,
        file.hash,
        file.meta.title,
        file.meta.artist,
        file.meta.album,
        file.meta.genre,
        file.meta.year,
        file.meta.duration_ms,
        file.meta.loudness_lufs,
        file.meta.loudness_gain,
        libraryTrackHashes.has(file.hash) ? 1 : 0,
      );
    }

    for (const hash of libraryTrackHashes) {
      markTrackInLibrary.run(hash);
    }

    for (let index = 0; index < manifest.playlists.length; index += 1) {
      const playlist = manifest.playlists[index];
      const coverPath = playlist.cover_relative_path
        ? path.join(getArtworkDir(), path.basename(playlist.cover_relative_path))
        : null;
      const playlistResult = insertPlaylist.run(
        playlist.name,
        playlist.description,
        coverPath,
        playlist.is_smart ? 1 : 0,
        playlist.smart_rules,
      );
      const playlistId = Number(playlistResult.lastInsertRowid);
      playlistIds.push(playlistId);

      let position = 0;
      for (const hash of playlist.track_hashes) {
        const trackRow = lookupTrackByHash.get(hash) as { id: number } | undefined;
        if (trackRow) {
          insertPlaylistTrack.run(playlistId, trackRow.id, position);
          position += 1;
        }
      }

      importedPlaylists += 1;
      sendProgress({ phase: 'playlists', current: index + 1, total: manifest.playlists.length });
    }
  });

  runImport();
  return { importedPlaylists, playlistIds };
}
