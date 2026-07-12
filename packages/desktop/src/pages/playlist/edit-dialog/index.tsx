import { Dialog } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { CoverPicker } from './cover-picker';
import { EditDialogActions } from './dialog-actions';
import type { EditPlaylistDialogProps } from './types';
import { useEditPlaylistForm } from './use-edit-playlist-form';

export function EditPlaylistDialog({ playlist, onClose, t }: EditPlaylistDialogProps) {
  const {
    coverUrl,
    handlePickCover,
    handleSave,
    inputRef,
    name,
    setName,
  } = useEditPlaylistForm({ onClose, playlist, t });

  return (
    <Dialog open onClose={onClose} title={t('editPlaylist')}>
      <CoverPicker coverUrl={coverUrl} t={t} onPickCover={() => void handlePickCover()} />

      <Input
        ref={inputRef}
        placeholder={t('playlistName')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            void handleSave();
          }
          if (event.key === 'Escape') {
            onClose();
          }
        }}
        style={{ background: 'var(--bg-elevated)' }}
      />

      <EditDialogActions
        t={t}
        onClose={onClose}
        onSave={() => {
          void handleSave();
        }}
      />
    </Dialog>
  );
}
