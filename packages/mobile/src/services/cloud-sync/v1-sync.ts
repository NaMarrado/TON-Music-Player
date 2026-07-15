import type { CloudSyncResult } from '@ton/core';
import { getMobileCloudLastRevision } from './config';
import { emitProgress, type ProgressCallback } from './v1-common';
import { fetchCloudLibrary } from './v1-fetch';
import { uploadMissingLocalToCloud } from './v1-upload';

let activeCancelRequested = false;

export async function syncCloudLibrary(
  onProgress?: ProgressCallback,
): Promise<CloudSyncResult | null> {
  activeCancelRequested = false;
  try {
    const isCancelled = () => activeCancelRequested;
    const uploadResult = await uploadMissingLocalToCloud(onProgress, isCancelled);
    const fetchResult = await fetchCloudLibrary(onProgress, isCancelled);
    return {
      uploaded: uploadResult.uploaded,
      downloaded: fetchResult.downloaded,
      skipped: uploadResult.skipped + fetchResult.skipped,
      failed: uploadResult.failed + fetchResult.failed,
      importedTracks: fetchResult.importedTracks,
      importedPlaylists: fetchResult.importedPlaylists,
      revision: fetchResult.revision
        ?? uploadResult.revision
        ?? ((await getMobileCloudLastRevision()) || null),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'cloud_sync_cancelled') {
      emitProgress(onProgress, { phase: 'cancelled' });
      return null;
    }
    throw error;
  } finally {
    activeCancelRequested = false;
  }
}

export function cancelMobileCloudSync(): void {
  activeCancelRequested = true;
}
