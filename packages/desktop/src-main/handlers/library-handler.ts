/**
 * Library IPC Handlers - scan directories, import tracks, query library.
 */

import { ipcMain } from 'electron';
import { handleLibraryDeleteTracks } from './library-handler/delete-tracks';
import { handleLibraryHomeSummary } from './library-handler/home-summary';
import { handleLibraryImportFiles } from './library-handler/import-files';
import {
  handleLibraryListSummary,
  handleLibraryListSummaryByIds,
} from './library-handler/list-summary';
import { handleLibraryGetTrackSnapshot } from './library-handler/track-snapshot';
import {
  handleAnalyzeAllTrackLoudness,
  handleAnalyzeTrackLoudness,
  getLibraryLoudnessStats,
} from './library-handler/loudness';
import { handleLibraryScan } from './library-handler/scan-directory';

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:import-files', async () => handleLibraryImportFiles());

  ipcMain.handle('library:scan', async (event, dirPath?: string) => {
    return handleLibraryScan(event, dirPath);
  });

  ipcMain.handle('library:analyze-loudness', async (_event, trackId: number) => {
    return handleAnalyzeTrackLoudness(trackId);
  });

  ipcMain.handle('library:analyze-loudness-all', async (event) => {
    return handleAnalyzeAllTrackLoudness(event);
  });

  ipcMain.handle('library:loudness-stats', async () => getLibraryLoudnessStats());
  ipcMain.handle('library:list-summary', async () => handleLibraryListSummary());
  ipcMain.handle('library:list-summary-by-ids', async (_event, trackIds: number[]) =>
    handleLibraryListSummaryByIds(trackIds));
  ipcMain.handle('library:home-summary', async () => handleLibraryHomeSummary());
  ipcMain.handle('library:get-track-snapshot', async (_event, trackId: number) =>
    handleLibraryGetTrackSnapshot(trackId));
  ipcMain.handle(
    'library:delete-tracks',
    async (_event, trackIds: number[], mode?: 'library-only' | 'everywhere') => {
      return handleLibraryDeleteTracks(trackIds, mode);
    },
  );
}
