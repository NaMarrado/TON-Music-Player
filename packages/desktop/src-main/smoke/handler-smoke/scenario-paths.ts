import fs from 'fs';
import path from 'path';
import { createToneWav } from './fixtures';
import type { ScenarioPaths } from './scenario-types';

export function prepareScenarioPaths(rootDir: string): ScenarioPaths {
  const sourceDir = path.join(rootDir, 'scan-source');
  const duplicateDir = path.join(rootDir, 'duplicate-source');
  const playlistImportDir = path.join(rootDir, 'playlist-import');
  const exportDir = path.join(rootDir, 'exports');
  const exportBundleDir = path.join(exportDir, 'compat-folder-bundle');
  const directPlaylistBundleZip = path.join(exportDir, 'direct-playlist-bundle.zip');
  const playlistBundleZip = path.join(exportDir, 'playlist-bundle.zip');

  for (const dir of [sourceDir, duplicateDir, playlistImportDir, exportDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const trackOne = path.join(sourceDir, 'Artist Alpha - Song One.wav');
  const trackTwo = path.join(sourceDir, 'Artist Beta - Song Two.wav');
  const playlistImportTrack = path.join(playlistImportDir, 'Artist Gamma - Playlist Song.wav');

  createToneWav(trackOne, 250, 220);
  createToneWav(trackTwo, 420, 330);
  createToneWav(playlistImportTrack, 610, 440);
  fs.copyFileSync(trackOne, path.join(duplicateDir, 'Artist Alpha - Song One.wav'));

  return {
    sourceDir,
    duplicateDir,
    playlistImportDir,
    exportDir,
    exportBundleDir,
    directPlaylistBundleZip,
    playlistBundleZip,
    trackOne,
    trackTwo,
    playlistImportTrack,
  };
}
