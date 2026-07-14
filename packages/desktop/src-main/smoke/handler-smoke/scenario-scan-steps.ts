import fs from 'fs';
import path from 'path';
import { getDb } from '../../services/database';
import { assert } from './assert';
import type {
  InvokeFn,
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
