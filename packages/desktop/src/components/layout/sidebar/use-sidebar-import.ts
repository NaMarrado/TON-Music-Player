import { useCallback, useEffect, useState } from 'react';
import {
  checkDuplicates,
  createPlaylist,
  importFolderAsPlaylist,
  loadPlaylists,
  pickImportPath,
  usePlaylistStore,
} from '../../../stores/playlist-store';
import { dismissToast, showToast } from '../../../stores/toast-store';

type SidebarImportArgs = {
  navigate: (path: string) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
};

export function useSidebarImport({ navigate, t }: SidebarImportArgs) {
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ total: number; existing: number } | null>(
    null,
  );

  useEffect(() => {
    if (!hasPlaylistsLoaded) {
      void loadPlaylists();
    }
  }, [hasPlaylistsLoaded]);

  const handleCreatePlaylist = useCallback(async (name: string) => {
    const playlist = await createPlaylist(name);
    setShowCreateDialog(false);
    navigate(`/playlist/${playlist.id}`);
  }, [navigate]);

  const runImport = useCallback(async (importPath: string, skipExisting: boolean) => {
    const loadingId = showToast(t('importing') || 'Importing...', 'loading', 0);
    try {
      const result = await importFolderAsPlaylist(importPath, skipExisting);
      dismissToast(loadingId);
      if (!result) return;
      if ('empty' in result) {
        showToast(t('folderEmpty'), 'error');
      } else {
        showToast(t('folderImported', { name: result.name }), 'success');
        navigate(`/playlist/${result.id}`);
      }
    } catch (error) {
      dismissToast(loadingId);
      const message = error instanceof Error && error.message
        ? error.message
        : t('folderImportError');
      showToast(message, 'error');
    }
  }, [navigate, t]);

  const startImport = useCallback(async (importPath: string) => {
    const duplicates = await checkDuplicates(importPath);
    if (duplicates && duplicates.existing > 0) {
      setPendingImportPath(importPath);
      setDuplicateInfo(duplicates);
      setShowImportDialog(true);
      return;
    }

    await runImport(importPath, false);
  }, [runImport]);

  const handleImportPlaylist = useCallback(async () => {
    const importPath = await pickImportPath();
    if (!importPath) return;
    await startImport(importPath);
  }, [startImport]);

  const handleImportChoice = useCallback(async (skipExisting: boolean) => {
    setShowImportDialog(false);
    const importPath = pendingImportPath;
    setPendingImportPath(null);
    setDuplicateInfo(null);
    if (!importPath) return;
    await runImport(importPath, skipExisting);
  }, [pendingImportPath, runImport]);

  const handleCancelImportChoice = useCallback(() => {
    setShowImportDialog(false);
    setPendingImportPath(null);
    setDuplicateInfo(null);
  }, []);

  return {
    duplicateInfo,
    handleCancelImportChoice,
    handleCreatePlaylist,
    handleImportChoice,
    handleImportPlaylist,
    playlists,
    setShowCreateDialog,
    showCreateDialog,
    showImportDialog,
    startImport,
  };
}
