import { ipcMain } from 'electron';
import { getLibraryExportSummary, startLibraryExport } from './export-flow';
import { discardImport, inspectImport, startLibraryImport } from './import-flow';

export function registerExportImportHandlers(): void {
  ipcMain.handle('export:start', startLibraryExport);
  ipcMain.handle('export:summary', getLibraryExportSummary);
  ipcMain.handle('import:inspect', inspectImport);
  ipcMain.handle('import:discard', discardImport);
  ipcMain.handle('import:start', startLibraryImport);
}
