import type { Playlist } from '@ton/core';
import type { TFunction } from 'i18next';
import { PlaylistDialogs } from './playlist-dialogs';

type PlaylistDialogSectionProps = {
  playlist: Playlist;
  t: TFunction<'pages/playlist'>;
  showDeleteConfirm: boolean;
  showRemoveConfirm: boolean;
  showEditDialog: boolean;
  onCloseDelete: () => void;
  onCloseRemove: () => void;
  onCloseEdit: () => void;
  onConfirmDelete: () => Promise<void>;
  onConfirmRemove: () => Promise<void>;
};

export function PlaylistDialogSection({
  playlist,
  t,
  showDeleteConfirm,
  showRemoveConfirm,
  showEditDialog,
  onCloseDelete,
  onCloseRemove,
  onCloseEdit,
  onConfirmDelete,
  onConfirmRemove,
}: PlaylistDialogSectionProps) {
  return (
    <PlaylistDialogs
      playlist={playlist}
      t={t}
      showDeleteConfirm={showDeleteConfirm}
      showRemoveConfirm={showRemoveConfirm}
      showEditDialog={showEditDialog}
      onCloseDelete={onCloseDelete}
      onCloseRemove={onCloseRemove}
      onCloseEdit={onCloseEdit}
      onConfirmDelete={onConfirmDelete}
      onConfirmRemove={onConfirmRemove}
    />
  );
}
