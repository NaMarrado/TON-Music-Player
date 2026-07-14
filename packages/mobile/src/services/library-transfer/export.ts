import type {
  LibraryExportResult,
  LibraryExportSelection,
  LibraryTransferProgress,
  LibraryTransferTask,
} from './shared';
import { canUseNativeLibraryTransfer } from './runtime';
import { startAndroidExportTask, startJsExportTask } from './export-tasks';

export async function beginExportMobileLibrary(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryExportResult>> {
  return canUseNativeLibraryTransfer()
    ? startAndroidExportTask(selection, onProgress)
    : startJsExportTask(selection, onProgress);
}

export async function exportMobileLibrary(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryExportResult | null> {
  const task = await beginExportMobileLibrary(selection, onProgress);
  return task.result;
}
