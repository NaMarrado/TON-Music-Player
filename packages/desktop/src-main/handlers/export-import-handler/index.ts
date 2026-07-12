import { ipcMain } from 'electron';
import { getLibraryExportSummary, startLibraryExport } from './export-flow';
import { startLibraryImport } from './import-flow';

export function registerExportImportHandlers(): void {
  ipcMain.handle('export:start', startLibraryExport);
  ipcMain.handle('export:summary', getLibraryExportSummary);
  ipcMain.handle('import:start', startLibraryImport);
}
