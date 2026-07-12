import { ActionButton } from './action-button';
import {
  AddToLibraryIcon,
  DeletePlaylistIcon,
  EditIcon,
  ExportIcon,
  ImportIcon,
  PlayAllIcon,
} from './icons';

type PlaylistActionsProps = {
  align?: 'start' | 'end';
  compact: boolean;
  isSmart: boolean;
  t: (key: string, vars?: Record<string, unknown>) => string;
  tracksCount: number;
  onAddToLibrary: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onExport: () => void;
  onImport: () => void;
  onPlayAll: () => void;
};

export function PlaylistActions({
  align = 'start',
  compact,
  isSmart,
  t,
  tracksCount,
  onAddToLibrary,
  onDelete,
  onEdit,
  onExport,
  onImport,
  onPlayAll,
}: PlaylistActionsProps) {
  return (
    <div
      className="gap-2"
      style={{
        display: compact ? 'grid' : 'flex',
        alignItems: 'center',
        flexWrap: compact ? undefined : 'wrap',
        justifyContent: compact ? undefined : align === 'end' ? 'flex-end' : 'flex-start',
        gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : undefined,
        width: compact ? '100%' : undefined,
      }}
    >
      {tracksCount > 0 && (
        <ActionButton compact={compact} fillWidth={compact} onClick={onPlayAll} primary>
          <PlayAllIcon />
          {t('playAll')}
        </ActionButton>
      )}

      <ActionButton compact={compact} fillWidth={compact} onClick={onEdit}>
        <EditIcon />
        {t('edit')}
      </ActionButton>

      {!isSmart && (
        <ActionButton compact={compact} fillWidth={compact} onClick={onImport}>
          <ImportIcon />
          {t('importFiles')}
        </ActionButton>
      )}

      {tracksCount > 0 && (
        <>
          <ActionButton compact={compact} fillWidth={compact} onClick={onExport}>
            <ExportIcon />
            {t('export')}
          </ActionButton>

          <ActionButton compact={compact} fillWidth={compact} onClick={onAddToLibrary}>
            <AddToLibraryIcon />
            {t('addToLibrary')}
          </ActionButton>
        </>
      )}

      <ActionButton compact={compact} fillWidth={compact} onClick={onDelete}>
        <DeletePlaylistIcon />
        {t('deletePlaylist')}
      </ActionButton>
    </div>
  );
}
