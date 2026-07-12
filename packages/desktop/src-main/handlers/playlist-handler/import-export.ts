import { ipcMain } from 'electron';
import { handleExportPlaylist } from '../playlist-export';
import {
  handleCheckDuplicates,
  handleImportFiles,
  handleImportFolder,
  handlePickImportPath,
} from '../playlist-import';

export function registerPlaylistImportExportHandlers(): void {
  ipcMain.handle('playlist:import-files', async (_event, playlistId: number) => (
    handleImportFiles(playlistId)
  ));
  ipcMain.handle('playlist:export', async (event, playlistId: number, destinationPath?: string) => (
    handleExportPlaylist(event, playlistId, destinationPath)
  ));
  ipcMain.handle('playlist:pick-import-path', async () => handlePickImportPath());
  ipcMain.handle('playlist:check-duplicates', async (_event, inputPath: string) => (
    handleCheckDuplicates(inputPath)
  ));
  ipcMain.handle('playlist:import-folder', async (_event, inputPath: string, skipExisting?: boolean) => (
    handleImportFolder(inputPath, !!skipExisting)
  ));
}
