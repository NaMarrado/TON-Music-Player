import type { ExportResult } from '../../shared/transfer-ipc';
import type {
  DuplicateCheck,
  ImportFolderResult,
} from './types';
import { invokeIpc } from './ipc';
import { loadPlaylist, loadPlaylists } from './loaders';
import { usePlaylistStore } from './store';

export async function importFilesToPlaylist(
  playlistId: number,
): Promise<{ imported: number }> {
  const result = (await invokeIpc('playlist:import-files', playlistId)) as {
    imported: number;
  };
  const { currentPlaylist } = usePlaylistStore.getState();
  if (currentPlaylist?.id === playlistId) {
    await loadPlaylist(playlistId);
  }
  await loadPlaylists({ force: true });
  return result;
}

export async function exportPlaylist(
  playlistId: number,
): Promise<string | null> {
  return (await invokeIpc('playlist:export', playlistId)) as string | null;
}

/** Exports exactly these songs (the current selection) as one bundle. */
export async function exportSongs(trackIds: number[]): Promise<ExportResult> {
  return (await invokeIpc('export:start', {
    kind: 'songs',
    includeLibrary: false,
    playlistIds: [],
    trackIds,
  })) as ExportResult;
}

export async function importFolderAsPlaylist(
  folderPath: string,
  skipExisting = false,
): Promise<ImportFolderResult> {
  const result = (await invokeIpc(
    'playlist:import-folder',
    folderPath,
    skipExisting,
  )) as ImportFolderResult;
  if (result && !('empty' in result)) {
    await loadPlaylists({ force: true });
  }
  return result;
}

export async function pickImportPath(): Promise<string | null> {
  return (await invokeIpc('playlist:pick-import-path')) as string | null;
}

export async function checkDuplicates(
  inputPath: string,
): Promise<DuplicateCheck | null> {
  return (await invokeIpc(
    'playlist:check-duplicates',
    inputPath,
  )) as DuplicateCheck | null;
}
