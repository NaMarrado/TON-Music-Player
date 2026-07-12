import type { Playlist } from '@ton/core';
import type { TFunction } from 'i18next';
import { PlaylistDialogs } from './playlist-dialogs';
import type { PlaylistLibraryCounts } from './use-playlist-actions/types';

type PlaylistDialogSectionProps = {
  playlist: Playlist;
  t: TFunction<'pages/playlist'>;
  showDeleteConfirm: boolean;
  showRemoveConfirm: boolean;
  showAddToLibrary: boolean;
  showEditDialog: boolean;
  libraryCounts: PlaylistLibraryCounts | null;
  onCloseDelete: () => void;
  onCloseRemove: () => void;
  onCloseAddToLibrary: () => void;
  onCloseEdit: () => void;
  onConfirmDelete: () => Promise<void>;
  onConfirmRemove: () => Promise<void>;
  onAddOnlyNew: () => Promise<void>;
  onAddAll: () => Promise<void>;
};

export function PlaylistDialogSection({
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
}: PlaylistDialogSectionProps) {
  return (
    <PlaylistDialogs
      playlist={playlist}
      t={t}
      showDeleteConfirm={showDeleteConfirm}
      showRemoveConfirm={showRemoveConfirm}
      showAddToLibrary={showAddToLibrary}
      showEditDialog={showEditDialog}
      libraryCounts={libraryCounts}
      onCloseDelete={onCloseDelete}
      onCloseRemove={onCloseRemove}
      onCloseAddToLibrary={onCloseAddToLibrary}
      onCloseEdit={onCloseEdit}
      onConfirmDelete={onConfirmDelete}
      onConfirmRemove={onConfirmRemove}
      onAddOnlyNew={onAddOnlyNew}
      onAddAll={onAddAll}
    />
  );
}
