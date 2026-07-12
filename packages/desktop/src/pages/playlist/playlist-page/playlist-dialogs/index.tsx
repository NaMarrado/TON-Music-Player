import type { Playlist } from '@ton/core';
import type { TFunction } from 'i18next';
import { EditPlaylistDialog } from '../../edit-dialog';
import { ConfirmDialog } from './confirm-dialog';

type PlaylistDialogsProps = {
  playlist: Playlist;
  t: TFunction<'pages/playlist'>;
  showDeleteConfirm: boolean;
  showRemoveConfirm: boolean;
  showEditDialog: boolean;
  onCloseDelete: () => void;
  onCloseRemove: () => void;
  onCloseEdit: () => void;
  onConfirmDelete: () => void;
  onConfirmRemove: () => void;
};

export function PlaylistDialogs({
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

      {showEditDialog && (
        <EditPlaylistDialog playlist={playlist} onClose={onCloseEdit} t={t} />
      )}
    </>
  );
}
