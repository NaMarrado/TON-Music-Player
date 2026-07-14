import type { CloudSyncResult } from '@ton/core';
import { getDesktopCloudLastRevision } from './config';
import type { CancelSignal, ProgressCallback } from './sync-common';
import { fetchCloudLibraryToDesktop } from './v1-fetch';
import { uploadMissingLocalToCloud } from './v1-upload';

export async function syncCloudLibraryForDesktop(
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<CloudSyncResult> {
  const uploadResult = await uploadMissingLocalToCloud(onProgress, shouldCancel);
  const fetchResult = await fetchCloudLibraryToDesktop(onProgress, shouldCancel);
  return {
    uploaded: uploadResult.uploaded,
    downloaded: fetchResult.downloaded,
    skipped: uploadResult.skipped + fetchResult.skipped,
    failed: uploadResult.failed + fetchResult.failed,
    importedTracks: fetchResult.importedTracks,
    importedPlaylists: fetchResult.importedPlaylists,
    revision: fetchResult.revision ?? uploadResult.revision ?? (getDesktopCloudLastRevision() || null),
  };
}
