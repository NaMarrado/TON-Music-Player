import fs from 'fs';
import path from 'path';
import { getDb } from '../../services/database';
import { getArtworkDir } from '../../services/metadata-reader/artwork';
import { assert } from './assert';
import { verifyAtomicExportRecovery } from './scenario-export-atomic';
import type {
  InvokeFn,
  ScenarioExportImportResults,
  ScenarioPaths,
} from './scenario-types';

export async function runExportImportRoundTrip(
  invoke: InvokeFn,
  progressEvents: Array<{ channel: string; payload: unknown }>,
  paths: ScenarioPaths,
  importedPlaylistId: number,
  importedPlaylistName: string,
): Promise<ScenarioExportImportResults> {
  await verifyAtomicExportRecovery(paths);

  const db = getDb();
  const canonicalMembership = db.prepare(`
    SELECT track_id, file_path
    FROM playlist_tracks
    WHERE playlist_id = ?
    ORDER BY position ASC
    LIMIT 1
  `).get(importedPlaylistId) as { track_id: number; file_path: string | null } | undefined;
  assert(canonicalMembership, 'Expected imported playlist membership before export');
  assert(
    canonicalMembership.file_path === null,
    'Expected canonical playlist membership to have no duplicated file path',
  );
  db.prepare(`
    UPDATE tracks
    SET file_hash = NULL,
        content_hash_sha256 = NULL,
        file_size = 1,
        downloaded_at = 1700000123
    WHERE id = ?
  `).run(canonicalMembership.track_id);
  db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path)
    VALUES (?, ?, 1, NULL)
  `).run(importedPlaylistId, canonicalMembership.track_id);
  const playlistCoverSourcePath = path.join(paths.exportDir, 'playlist-cover-source.png');
  const playlistCoverContents = Buffer.from('fixture-playlist-cover-v1');
  fs.writeFileSync(playlistCoverSourcePath, playlistCoverContents);
  db.prepare('UPDATE playlists SET cover_path = ? WHERE id = ?')
    .run(playlistCoverSourcePath, importedPlaylistId);

  const folderExportResult = await invoke<{
    trackCount: number;
    playlistCount: number;
    sizeBytes: number;
  }>('export:start', {
    destinationPath: paths.exportBundleDir,
    bundleFormat: 'folder',
  });
  assert(folderExportResult.trackCount === 3, `Expected folder export trackCount=3, got ${folderExportResult.trackCount}`);
  assert(
    folderExportResult.playlistCount === 1,
    `Expected folder export playlistCount=1, got ${folderExportResult.playlistCount}`,
  );
  assert(fs.existsSync(path.join(paths.exportBundleDir, 'manifest.json')), 'Expected folder export manifest.json');
  assert(fs.existsSync(path.join(paths.exportBundleDir, 'tracks')), 'Expected folder export tracks directory');
  assert(
    progressEvents.some((event) => event.channel === 'export:progress'),
    'Expected export progress events to be emitted',
  );

  const exportedManifest = JSON.parse(
    fs.readFileSync(path.join(paths.exportBundleDir, 'manifest.json'), 'utf-8'),
  ) as {
    track_count: number;
    playlist_count: number;
    tracks: Array<{
      content_hash_sha256?: string;
      downloaded_at?: number | null;
      relative_path: string;
    }>;
    playlists: Array<{ cover_relative_path?: string | null; track_hashes: string[] }>;
  };
  assert(exportedManifest.track_count === 3, `Expected exported manifest track_count=3, got ${exportedManifest.track_count}`);
  assert(
    exportedManifest.playlist_count === 1,
    `Expected exported manifest playlist_count=1, got ${exportedManifest.playlist_count}`,
  );
  assert(
    exportedManifest.tracks.every((track) => track.relative_path.startsWith('tracks/')),
    'Expected exported manifest track paths to live under tracks/',
  );
  assert(
    exportedManifest.tracks.every((track) => /^[a-f0-9]{64}$/.test(track.content_hash_sha256 ?? '')),
    'Expected every exported track to include a stable SHA-256 content identity',
  );
  const backfilledTrackIdentity = db.prepare(`
    SELECT file_hash, content_hash_sha256
    FROM tracks
    WHERE id = ?
  `).get(canonicalMembership.track_id) as {
    file_hash: string | null;
    content_hash_sha256: string | null;
  };
  assert(
    backfilledTrackIdentity.file_hash === backfilledTrackIdentity.content_hash_sha256
      && /^[a-f0-9]{64}$/.test(backfilledTrackIdentity.content_hash_sha256 ?? ''),
    'Expected export to persist a stable identity for a canonical track with no legacy hash',
  );
  const exportedCanonicalTrack = exportedManifest.tracks.find(
    (track) => track.content_hash_sha256 === backfilledTrackIdentity.content_hash_sha256,
  );
  assert(
    exportedCanonicalTrack?.downloaded_at === 1700000123,
    'Expected export to preserve the original TON download timestamp',
  );
  assert(
    exportedManifest.playlists[0]?.track_hashes.length === 2
      && exportedManifest.playlists[0].track_hashes[0] === exportedManifest.playlists[0].track_hashes[1],
    'Expected duplicate playlist positions to reference one canonical exported track',
  );
  assert(
    Boolean(exportedManifest.playlists[0]?.cover_relative_path),
    'Expected playlist cover to be included in the portable bundle',
  );

  const playlistBundleExportResult = await invoke<{
    trackCount: number;
    playlistCount: number;
    sizeBytes: number;
  }>('export:start', {
    destinationPath: paths.playlistBundleZip,
    bundleFormat: 'archive',
    includeLibrary: false,
    playlistIds: [importedPlaylistId],
  });
  assert(
    playlistBundleExportResult.trackCount === 1,
    `Expected playlist bundle export trackCount=1, got ${playlistBundleExportResult.trackCount}`,
  );
  assert(
    playlistBundleExportResult.playlistCount === 1,
    `Expected playlist bundle export playlistCount=1, got ${playlistBundleExportResult.playlistCount}`,
  );
  assert(fs.existsSync(paths.playlistBundleZip), 'Expected playlist bundle archive to exist');

  const directPlaylistPath = await invoke<string | null>(
    'playlist:export',
    importedPlaylistId,
    paths.directPlaylistBundleZip,
  );
  assert(
    directPlaylistPath === paths.directPlaylistBundleZip,
    'Expected direct playlist export to return its canonical bundle path',
  );
  assert(
    fs.existsSync(paths.directPlaylistBundleZip),
    'Expected direct playlist export bundle to exist',
  );

  db.exec(`
    DELETE FROM playlist_tracks;
    DELETE FROM playlists;
    DELETE FROM tracks;
  `);

  const clearedCounts = db
    .prepare('SELECT (SELECT COUNT(*) FROM tracks) as tracks, (SELECT COUNT(*) FROM playlists) as playlists')
    .get() as { tracks: number; playlists: number };
  assert(clearedCounts.tracks === 0, `Expected cleared tracks=0, got ${clearedCounts.tracks}`);
  assert(clearedCounts.playlists === 0, `Expected cleared playlists=0, got ${clearedCounts.playlists}`);

  const exportedCoverRelativePath = exportedManifest.playlists[0].cover_relative_path as string;
  const artworkDir = getArtworkDir();
  fs.mkdirSync(artworkDir, { recursive: true });
  const staleCoverPath = path.join(artworkDir, path.basename(exportedCoverRelativePath));
  fs.writeFileSync(staleCoverPath, 'stale-cover-with-colliding-name');

  const folderImportResult = await invoke<{
    importedTracks: number;
    skippedTracks: number;
    importedPlaylists: number;
  }>('import:start', {
    bundlePath: paths.exportBundleDir,
  });
  assert(
    folderImportResult.importedTracks === 3,
    `Expected folder import importedTracks=3, got ${folderImportResult.importedTracks}`,
  );
  assert(
    folderImportResult.skippedTracks === 0,
    `Expected folder import skippedTracks=0, got ${folderImportResult.skippedTracks}`,
  );
  assert(
    folderImportResult.importedPlaylists === 1,
    `Expected folder import importedPlaylists=1, got ${folderImportResult.importedPlaylists}`,
  );
  assert(
    progressEvents.some((event) => event.channel === 'import:progress'),
    'Expected import progress events to be emitted',
  );

  const importedCounts = db
    .prepare('SELECT (SELECT COUNT(*) FROM tracks) as tracks, (SELECT COUNT(*) FROM playlists) as playlists')
    .get() as { tracks: number; playlists: number };
  assert(importedCounts.tracks === 3, `Expected imported tracks=3, got ${importedCounts.tracks}`);
  assert(importedCounts.playlists === 1, `Expected imported playlists=1, got ${importedCounts.playlists}`);
  const importedCanonicalTrack = db.prepare(`
    SELECT file_path, file_size, downloaded_at
    FROM tracks
    WHERE content_hash_sha256 = ?
  `).get(backfilledTrackIdentity.content_hash_sha256) as {
    downloaded_at: number | null;
    file_path: string;
    file_size: number | null;
  } | undefined;
  assert(importedCanonicalTrack, 'Expected canonical track after folder import');
  assert(
    importedCanonicalTrack.downloaded_at === 1700000123,
    'Expected folder import to preserve the original TON download timestamp',
  );
  assert(
    importedCanonicalTrack.file_size === fs.statSync(importedCanonicalTrack.file_path).size,
    'Expected folder import to persist the copied file physical size',
  );
  const importedCover = db.prepare('SELECT cover_path FROM playlists LIMIT 1')
    .get() as { cover_path: string | null } | undefined;
  assert(importedCover?.cover_path, 'Expected imported playlist cover path');
  assert(
    importedCover.cover_path !== staleCoverPath,
    'Expected a colliding artwork filename not to reuse an unrelated cover',
  );
  assert(
    fs.readFileSync(importedCover.cover_path).equals(playlistCoverContents),
    'Expected imported playlist to reference the exported cover contents',
  );

  db.exec(`
    DELETE FROM playlist_tracks;
    DELETE FROM playlists;
    DELETE FROM tracks;
  `);

  const importedTonPlaylist = await invoke<{ id: number; name: string } | { empty: true } | null>(
    'playlist:import-folder',
    paths.directPlaylistBundleZip,
    false,
  );
  assert(
    importedTonPlaylist && !('empty' in importedTonPlaylist),
    'Expected TON bundle playlist import to create a playlist',
  );
  assert(
    importedTonPlaylist.name === importedPlaylistName,
    `Expected TON bundle playlist name=${importedPlaylistName}, got ${importedTonPlaylist.name}`,
  );

  const tonPlaylistTrackCount = db
    .prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?')
    .get(importedTonPlaylist.id) as { count: number };
  assert(
    tonPlaylistTrackCount.count === 2,
    `Expected TON bundle imported playlist to preserve 2 ordered positions, got ${tonPlaylistTrackCount.count}`,
  );
  const importedArchiveTrack = db.prepare(`
    SELECT t.file_path, t.file_size, t.downloaded_at
    FROM tracks t
    JOIN playlist_tracks pt ON pt.track_id = t.id
    WHERE pt.playlist_id = ?
    LIMIT 1
  `).get(importedTonPlaylist.id) as {
    downloaded_at: number | null;
    file_path: string;
    file_size: number | null;
  } | undefined;
  assert(importedArchiveTrack, 'Expected canonical track after archive playlist import');
  assert(
    importedArchiveTrack.downloaded_at === 1700000123,
    'Expected archive import to preserve the original TON download timestamp',
  );
  assert(
    importedArchiveTrack.file_size === fs.statSync(importedArchiveTrack.file_path).size,
    'Expected archive import to persist the copied file physical size',
  );

  return {
    folderExportResult,
    folderImportResult,
  };
}
