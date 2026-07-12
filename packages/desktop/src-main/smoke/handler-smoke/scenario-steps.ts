import fs from 'fs';
import path from 'path';
import { findBestMatch, type LoadedPlaylistImport } from '@ton/core';
import { getDb } from '../../services/database';
import { replaceDesktopPlaylistImportSnapshot } from '../../services/playlist-import/snapshot';
import {
  assignDesktopPlaylistImportQueues,
  assignDesktopPlaylistImportTracks,
  materializeDesktopPlaylistImport,
  settleDesktopPlaylistImportQueueItem,
} from '../../services/playlist-import/targets';
import {
  markDownloadDone,
  updateDownloadProgress,
} from '../../services/downloader/status';
import { assert } from './assert';
import type {
  InvokeFn,
  ScenarioDeleteResults,
  ScenarioExportImportResults,
  ScenarioPaths,
  ScenarioPlaylistResults,
  ScenarioScanResults,
} from './scenario-types';

export async function runScanAndDuplicateChecks(
  invoke: InvokeFn,
  progressEvents: Array<{ channel: string; payload: unknown }>,
  paths: ScenarioPaths,
): Promise<ScenarioScanResults> {
  const scanResult = await invoke<{ imported: number; skipped: number }>('library:scan', paths.sourceDir);
  assert(scanResult.imported === 2, `Expected first scan to import 2 tracks, got ${scanResult.imported}`);
  assert(scanResult.skipped === 0, `Expected first scan to skip 0 tracks, got ${scanResult.skipped}`);
  assert(
    progressEvents.some((event) => event.channel === 'library:scan-progress'),
    'Expected scan progress events to be emitted',
  );

  const rescanResult = await invoke<{ imported: number; skipped: number }>('library:scan', paths.sourceDir);
  assert(rescanResult.imported === 0, `Expected rescan to import 0 tracks, got ${rescanResult.imported}`);
  assert(rescanResult.skipped === 2, `Expected rescan to skip 2 tracks, got ${rescanResult.skipped}`);

  const db = getDb();
  const scannedTracks = db
    .prepare('SELECT id, file_path, in_library FROM tracks ORDER BY id ASC')
    .all() as Array<{ id: number; file_path: string; in_library: number }>;
  assert(scannedTracks.length === 2, `Expected 2 scanned tracks in DB, got ${scannedTracks.length}`);
  assert(scannedTracks.every((track) => track.in_library === 1), 'Expected scanned tracks to be in library');
  assert(scannedTracks.every((track) => fs.existsSync(track.file_path)), 'Expected scanned files to exist');

  const duplicateStatus = await invoke<{ total: number; existing: number } | null>(
    'playlist:check-duplicates',
    paths.duplicateDir,
  );
  assert(duplicateStatus !== null, 'Expected duplicate check result');
  assert(duplicateStatus.total === 1, `Expected duplicate check total=1, got ${duplicateStatus.total}`);
  assert(
    duplicateStatus.existing === 1,
    `Expected duplicate check existing=1, got ${duplicateStatus.existing}`,
  );

  return {
    scanResult,
    rescanResult,
    duplicateStatus,
  };
}

export async function runPlaylistLibraryChecks(
  invoke: InvokeFn,
  rootDir: string,
  playlistImportDir: string,
): Promise<ScenarioPlaylistResults> {
  const importedPlaylist = await invoke<{ id: number; name?: string } | { empty: true } | null>(
    'playlist:import-folder',
    playlistImportDir,
    false,
  );
  assert(importedPlaylist && !('empty' in importedPlaylist), 'Expected playlist import to create a playlist');

  const db = getDb();
  const importedTrack = db
    .prepare(`
      SELECT t.file_path, t.in_library
      FROM tracks t
      JOIN playlist_tracks pt ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
    `)
    .get(importedPlaylist.id) as { file_path: string; in_library: number } | undefined;
  assert(importedTrack, 'Expected imported playlist track to exist');
  assert(importedTrack.in_library === 1, 'Expected imported playlist track to be marked in library');
  assert(fs.existsSync(importedTrack.file_path), 'Expected imported playlist library file to exist');
  assert(
    importedTrack.file_path.startsWith(path.join(rootDir, 'music', 'TON')),
    `Expected imported library path under temp music dir, got ${importedTrack.file_path}`,
  );

  return {
    importedPlaylistId: importedPlaylist.id,
    importedPlaylistName: importedPlaylist.name ?? 'Imported playlist',
  };
}

export async function runExportImportRoundTrip(
  invoke: InvokeFn,
  progressEvents: Array<{ channel: string; payload: unknown }>,
  paths: ScenarioPaths,
  importedPlaylistId: number,
  importedPlaylistName: string,
): Promise<ScenarioExportImportResults> {
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
    tracks: Array<{ relative_path: string }>;
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

  const db = getDb();
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

  db.exec(`
    DELETE FROM playlist_tracks;
    DELETE FROM playlists;
    DELETE FROM tracks;
  `);

  const importedTonPlaylist = await invoke<{ id: number; name: string } | { empty: true } | null>(
    'playlist:import-folder',
    paths.playlistBundleZip,
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
    tonPlaylistTrackCount.count === 1,
    `Expected TON bundle imported playlist to contain 1 track, got ${tonPlaylistTrackCount.count}`,
  );

  return {
    folderExportResult,
    folderImportResult,
  };
}

export async function runDeleteChecks(
  invoke: InvokeFn,
): Promise<ScenarioDeleteResults> {
  const db = getDb();
  const loudnessStats = await invoke<{ total: number; analyzed: number; missing: number }>(
    'library:loudness-stats',
  );
  assert(loudnessStats.total === 1, `Expected loudness total=1, got ${loudnessStats.total}`);
  assert(loudnessStats.analyzed === 0, `Expected loudness analyzed=0, got ${loudnessStats.analyzed}`);
  assert(loudnessStats.missing === 1, `Expected loudness missing=1, got ${loudnessStats.missing}`);

  const importedTracksAfterRoundTrip = db
    .prepare('SELECT id, file_path FROM tracks ORDER BY id ASC')
    .all() as Array<{ id: number; file_path: string }>;
  assert(
    importedTracksAfterRoundTrip.length === 1,
    `Expected 1 track after TON playlist bundle import, got ${importedTracksAfterRoundTrip.length}`,
  );

  const firstTrackId = importedTracksAfterRoundTrip[0].id;
  const firstTrackPath = importedTracksAfterRoundTrip[0].file_path;
  const deleteResult = await invoke<{ deleted: number }>('library:delete-tracks', [firstTrackId]);
  assert(deleteResult.deleted === 1, `Expected deleted=1, got ${deleteResult.deleted}`);
  assert(!fs.existsSync(firstTrackPath), 'Expected deleted library file to be removed from disk');

  const deletedTrackRow = db
    .prepare('SELECT id FROM tracks WHERE id = ?')
    .get(firstTrackId) as { id: number } | undefined;
  assert(!deletedTrackRow, 'Expected deleted track row to be removed from DB');

  return {
    loudnessStats,
    deleteResult,
  };
}

export async function runPlaylistDownloadImportChecks(
  rootDir: string,
  sourceAudioPath: string,
): Promise<void> {
  const match = findBestMatch(
    { artist: 'K.Flay', duration_ms: 215_000, title: 'Make Me Fade' },
    [
      {
        artist: 'K.Flay',
        duration_ms: 215_000,
        id: 'remix',
        title: 'Make Me Fade (Remix)',
        url: 'https://youtube.test/remix',
      },
      {
        artist: 'K.Flay - Topic',
        duration_ms: 215_500,
        id: 'original',
        title: 'Make Me Fade',
        url: 'https://youtube.test/original',
      },
    ],
  );
  assert(match?.id === 'original', 'Expected original YouTube candidate to beat remix');

  const db = getDb();
  const fixtureDir = path.join(rootDir, 'playlist-download-import');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const xPath = path.join(fixtureDir, 'x.mp3');
  const yPath = path.join(fixtureDir, 'y.mp3');
  fs.copyFileSync(sourceAudioPath, xPath);
  fs.copyFileSync(sourceAudioPath, yPath);

  const loaded: LoadedPlaylistImport = {
    name: 'Fixture Playlist',
    source: 'spotify',
    sourceId: 'fixture-playlist',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist',
    tracks: [
      {
        album: null,
        artist: 'Fixture Artist',
        coverUrl: null,
        durationMs: 120_000,
        position: 0,
        sourceTrackId: 'fixture-x',
        title: 'Track X',
      },
      {
        album: null,
        artist: 'Fixture Artist',
        coverUrl: null,
        durationMs: 120_000,
        position: 1,
        sourceTrackId: 'fixture-y',
        title: 'Track Y',
      },
      {
        album: null,
        artist: 'Fixture Artist',
        coverUrl: null,
        durationMs: 120_000,
        position: 2,
        sourceTrackId: 'fixture-x',
        title: 'Track X',
      },
    ],
  };
  const snapshot = await replaceDesktopPlaylistImportSnapshot(loaded);
  const secondSnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Second Fixture Playlist',
    sourceId: 'fixture-playlist-two',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-two',
    tracks: [{ ...loaded.tracks[0], position: 0 }],
  });
  const queueX = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-x', 'Track X', 'downloading')`,
  ).run().lastInsertRowid);
  const queueY = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-y', 'Track Y', 'downloading')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    {
      importItemIds: [
        snapshot.items[0].id,
        snapshot.items[2].id,
        secondSnapshot.items[0].id,
      ],
      queueId: queueX,
    },
    { importItemIds: [snapshot.items[1].id], queueId: queueY },
  ]);

  const insertTrack = db.prepare(
    `INSERT INTO tracks (file_path, title, artist, spotify_id, in_library)
     VALUES (?, ?, 'Fixture Artist', ?, 1)`,
  );
  const trackX = Number(insertTrack.run(xPath, 'Track X', 'fixture-x').lastInsertRowid);
  const trackY = Number(insertTrack.run(yPath, 'Track Y', 'fixture-y').lastInsertRowid);

  await settleDesktopPlaylistImportQueueItem(queueY, trackY);
  await settleDesktopPlaylistImportQueueItem(queueX, trackX);
  const settledOrder = db.prepare(
    `SELECT pt.track_id
     FROM playlist_tracks pt
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
  ).all(snapshot.playlist.id) as Array<{ track_id: number }>;
  assert(
    settledOrder.map((row) => row.track_id).join(',') === `${trackX},${trackY},${trackX}`,
    'Expected out-of-order settlements to preserve source order and duplicate positions',
  );
  const secondPlaylistTracks = db.prepare(
    'SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC',
  ).all(secondSnapshot.playlist.id) as Array<{ track_id: number }>;
  assert(
    secondPlaylistTracks.length === 1 && secondPlaylistTracks[0].track_id === trackX,
    'Expected one queue item to settle into multiple imported playlists',
  );

  const lateSnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Late Fixture Playlist',
    sourceId: 'fixture-playlist-late',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-late',
    tracks: [{ ...loaded.tracks[0], position: 0 }],
  });
  const lateQueue = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-x', 'Track X', 'done')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    { importItemIds: [lateSnapshot.items[0].id], queueId: lateQueue },
  ]);
  await materializeDesktopPlaylistImport(lateSnapshot.importSourceId);
  const lateBoundOrder = db.prepare(
    `SELECT pt.track_id
     FROM playlist_tracks pt
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
  ).all(lateSnapshot.playlist.id) as Array<{ track_id: number }>;
  assert(
    lateBoundOrder.length === 1 && lateBoundOrder[0].track_id === trackX,
    'Expected a queue bound after track creation to materialize without another completion event',
  );

  const retryTrack = {
    ...loaded.tracks[0],
    sourceTrackId: 'fixture-retry',
    title: 'Track Retry',
  };
  const retrySnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Retry Fixture Playlist',
    sourceId: 'fixture-playlist-retry',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-retry',
    tracks: [{ ...retryTrack, position: 0 }],
  });
  const retryQueue = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-retry', 'Track Retry', 'error')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    { importItemIds: [retrySnapshot.items[0].id], queueId: retryQueue },
  ]);
  await materializeDesktopPlaylistImport(retrySnapshot.importSourceId);
  const rowsBeforeRetry = db.prepare(
    'SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?',
  ).get(retrySnapshot.playlist.id) as { count: number };
  assert(rowsBeforeRetry.count === 0, 'Expected a failed queue item to stay out of its playlist');

  const retryPath = path.join(fixtureDir, 'retry.mp3');
  fs.copyFileSync(sourceAudioPath, retryPath);
  const retryTrackId = Number(
    insertTrack.run(retryPath, 'Track Retry', 'fixture-retry').lastInsertRowid,
  );
  db.prepare("UPDATE download_queue SET status = 'pending' WHERE id = ?").run(retryQueue);
  await settleDesktopPlaylistImportQueueItem(retryQueue, retryTrackId);
  db.prepare('DELETE FROM download_queue WHERE id = ?').run(retryQueue);
  const retryBinding = db.prepare(
    `SELECT queue_id, track_id
     FROM playlist_import_items
     WHERE id = ?`,
  ).get(retrySnapshot.items[0].id) as {
    queue_id: number | null;
    track_id: number | null;
  };
  assert(
    retryBinding.queue_id == null && retryBinding.track_id === retryTrackId,
    'Expected retry settlement to survive completed queue cleanup',
  );

  const cancelledSnapshot = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Cancelled Fixture Playlist',
    sourceId: 'fixture-playlist-cancelled',
    sourceUrl: 'https://open.spotify.com/playlist/fixture-playlist-cancelled',
    tracks: [{
      ...loaded.tracks[0],
      position: 0,
      sourceTrackId: 'fixture-cancelled',
      title: 'Track Cancelled',
    }],
  });
  const cancelledQueue = Number(db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('spotify', 'fixture-cancelled', 'Track Cancelled', 'cancelled')`,
  ).run().lastInsertRowid);
  assignDesktopPlaylistImportQueues([
    { importItemIds: [cancelledSnapshot.items[0].id], queueId: cancelledQueue },
  ]);
  await materializeDesktopPlaylistImport(cancelledSnapshot.importSourceId);
  const cancelledRows = db.prepare(
    'SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?',
  ).get(cancelledSnapshot.playlist.id) as { count: number };
  assert(cancelledRows.count === 0, 'Expected a cancelled queue item to stay out of its playlist');

  db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path)
     VALUES (?, ?, 99, NULL)`,
  ).run(snapshot.playlist.id, trackY);
  db.prepare(
    'UPDATE playlists SET name = ?, cover_path = ? WHERE id = ?',
  ).run('Custom Fixture Playlist', '/fixture/custom-cover.png', snapshot.playlist.id);
  const reimported = await replaceDesktopPlaylistImportSnapshot({
    ...loaded,
    name: 'Updated Source Playlist',
    tracks: [loaded.tracks[1], loaded.tracks[0]].map((track, position) => ({
      ...track,
      position,
    })),
  });
  assert(reimported.playlist.id === snapshot.playlist.id, 'Expected reimport to reuse playlist');
  assert(
    reimported.playlist.name === 'Custom Fixture Playlist',
    'Expected reimport to preserve a custom playlist name',
  );
  assert(
    reimported.playlist.cover_path === '/fixture/custom-cover.png',
    'Expected reimport to preserve a custom playlist cover',
  );
  assignDesktopPlaylistImportTracks([
    { importItemIds: [reimported.items[0].id], trackId: trackY },
    { importItemIds: [reimported.items[1].id], trackId: trackX },
  ]);
  await materializeDesktopPlaylistImport(reimported.importSourceId);

  const reimportedRows = db.prepare(
    `SELECT pt.track_id, pt.import_item_id
     FROM playlist_tracks pt
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
  ).all(reimported.playlist.id) as Array<{
    import_item_id: number | null;
    track_id: number;
  }>;
  assert(reimportedRows.length === 3, 'Expected two imported tracks plus one manual track');
  assert(
    reimportedRows.map((row) => row.track_id).join(',') === `${trackY},${trackX},${trackY}`,
    'Expected reimported source order followed by preserved manual track',
  );
  assert(reimportedRows[2].import_item_id == null, 'Expected manual playlist row to remain manual');
}

export async function runDownloadCancelAllCheck(invoke: InvokeFn): Promise<void> {
  const db = getDb();
  const marker = `cancel-all-smoke-${Date.now()}`;
  const insert = db.prepare(
    `INSERT INTO download_queue (source, source_id, title, status)
     VALUES ('youtube', ?, ?, ?)`,
  );
  const statuses = ['pending', 'downloading', 'resolving', 'converting', 'done', 'error'];
  const ids = statuses.map((status, index) => Number(
    insert.run(`${marker}-${index}`, marker, status).lastInsertRowid,
  ));

  await invoke<void>('download:cancel-all');

  const rows = db.prepare(
    `SELECT id, status FROM download_queue
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
  ).all(...ids) as Array<{ id: number; status: string }>;
  const statusById = new Map(rows.map((row) => [row.id, row.status]));

  for (let index = 0; index < 4; index += 1) {
    assert(
      statusById.get(ids[index]) === 'cancelled',
      `Expected ${statuses[index]} download to be cancelled by Cancel All`,
    );
  }
  assert(statusById.get(ids[4]) === 'done', 'Expected completed download to remain done');
  assert(statusById.get(ids[5]) === 'error', 'Expected failed download to remain failed');

  assert(
    !updateDownloadProgress(ids[0], 'downloading', 0.5),
    'Expected late progress to be ignored after Cancel All',
  );
  assert(
    !markDownloadDone(ids[1]),
    'Expected late completion to be ignored after Cancel All',
  );
  const cancelledRows = db.prepare(
    `SELECT COUNT(*) AS count FROM download_queue
     WHERE id IN (?, ?) AND status = 'cancelled'`,
  ).get(ids[0], ids[1]) as { count: number };
  assert(cancelledRows.count === 2, 'Expected cancelled downloads to stay cancelled');

  db.prepare(`DELETE FROM download_queue WHERE id IN (${ids.map(() => '?').join(', ')})`).run(...ids);
}
