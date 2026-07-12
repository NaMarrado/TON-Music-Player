import type { Playlist } from '@ton/core';
import type { TFunction } from 'i18next';
import { EditPlaylistDialog } from '../../edit-dialog';
import { AddToLibraryDialog } from './add-to-library-dialog';
import { ConfirmDialog } from './confirm-dialog';

type PlaylistDialogsProps = {
  playlist: Playlist;
  t: TFunction<'pages/playlist'>;
  showDeleteConfirm: boolean;
  showRemoveConfirm: boolean;
  showAddToLibrary: boolean;
  showEditDialog: boolean;
  libraryCounts: { total: number; alreadyInLibrary: number; newTracks: number } | null;
  onCloseDelete: () => void;
  onCloseRemove: () => void;
  onCloseAddToLibrary: () => void;
  onCloseEdit: () => void;
  onConfirmDelete: () => void;
  onConfirmRemove: () => void;
  onAddOnlyNew: () => void;
  onAddAll: () => void;
};

export function PlaylistDialogs({
  playlist,
  t,
  showDeleteConfirm,
  showRemoveConfirm,
  showAddToLibrary,
  showEditDialog,
  libraryCounts,
  onCloseDelete,
  onCloseRemove,
  onCloseAddToLibrary,
  onCloseEdit,
  onConfirmDelete,
  onConfirmRemove,
  onAddOnlyNew,
  onAddAll,
}: PlaylistDialogsProps) {
  return (
    <>
      {showDeleteConfirm && (
        <ConfirmDialog
          description={t('confirmDeleteDesc')}
          onCancel={onCloseDelete}
          onConfirm={onConfirmDelete}
          title={t('confirmDelete')}
          t={t}
        />
      )}

      {showRemoveConfirm && (
        <ConfirmDialog
          description={t('confirmRemoveDesc')}
          onCancel={onCloseRemove}
          onConfirm={onConfirmRemove}
          title={t('confirmRemove')}
          t={t}
        />
      )}

      {showAddToLibrary && libraryCounts && (
        <AddToLibraryDialog
          libraryCounts={libraryCounts}
          onAddAll={onAddAll}
          onAddOnlyNew={onAddOnlyNew}
          onClose={onCloseAddToLibrary}
          t={t}
        />
      )}

      {showEditDialog && (
        <EditPlaylistDialog playlist={playlist} onClose={onCloseEdit} t={t} />
      )}
    </>
  );
}
