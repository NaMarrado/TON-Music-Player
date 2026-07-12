import type { DownloadRuntimeMeta } from './download-store-types';
import { useDownloadStore } from './download-store-state';

export { useDownloadStore } from './download-store-state';
export {
  cancelAllDownloads,
  cancelDownload,
  clearAll,
  clearCompleted,
  clearFailed,
  importPlaylist,
  loadDownloads,
  retryDownload,
  startDownload,
} from './download-store-commands';
export { subscribeToDownloadEvents } from './download-store-events';
export type { DownloadRuntimeMeta } from './download-store-types';

export function useDownloadRuntimeMeta(id: number): DownloadRuntimeMeta | null {
  return useDownloadStore((state) => state.runtimeMetaById[id] ?? null);
}
