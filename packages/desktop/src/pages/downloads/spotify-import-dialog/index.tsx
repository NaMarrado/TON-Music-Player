import { Dialog } from '../../../components/ui/dialog';
import { DialogForm } from './dialog-form';
import { DialogSuccess } from './dialog-success';
import { useSpotifyImportDialog } from './use-spotify-import-dialog';

interface PlaylistImportDialogProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
  onClose: () => void;
}

export function PlaylistImportDialog({ t, onClose }: PlaylistImportDialogProps) {
  const {
    error,
    handleImport,
    inputRef,
    isLoading,
    result,
    setUrl,
    url,
  } = useSpotifyImportDialog();

  return (
    <Dialog open={true} onClose={onClose} title={t('importTitle')} width="440px">
      {result ? (
        <DialogSuccess
          playlistName={result.playlistName}
          trackCount={result.totalCount}
          t={t}
          onClose={onClose}
        />
      ) : (
        <DialogForm
          error={error}
          inputRef={inputRef}
          isLoading={isLoading}
          t={t}
          url={url}
          onClose={onClose}
          onImport={() => {
            void handleImport();
          }}
          onSetUrl={setUrl}
        />
      )}
    </Dialog>
  );
}
