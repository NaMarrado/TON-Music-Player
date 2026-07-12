import { Platform } from 'react-native';
import {
  createAndroidLibraryTransferJobId,
  isAndroidLibraryTransferAvailable,
  startAndroidLibraryExport,
  startAndroidLibraryImport,
  type AndroidLibraryExportRequest,
  type AndroidLibraryImportRequest,
} from '../native-library-transfer';
import type { LibraryTransferProgress, LibraryTransferTask } from './types';

function createFallbackLibraryTransferJobId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function canUseNativeLibraryTransfer(): boolean {
  return Platform.OS === 'android' && isAndroidLibraryTransferAvailable();
}

export function createLibraryTransferJobId(prefix = 'library-transfer'): string {
  return canUseNativeLibraryTransfer()
    ? createAndroidLibraryTransferJobId(prefix)
    : createFallbackLibraryTransferJobId(prefix);
}

export async function startNativeLibraryImportTask<Result>(
  request: AndroidLibraryImportRequest,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<Result>> {
  if (!canUseNativeLibraryTransfer()) {
    throw new Error('Native library import is unavailable');
  }

  return startAndroidLibraryImport<Result>(request, onProgress);
}

export async function startNativeLibraryExportTask<Result>(
  request: AndroidLibraryExportRequest,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<Result>> {
  if (!canUseNativeLibraryTransfer()) {
    throw new Error('Native library export is unavailable');
  }

  return startAndroidLibraryExport<Result>(request, onProgress);
}
