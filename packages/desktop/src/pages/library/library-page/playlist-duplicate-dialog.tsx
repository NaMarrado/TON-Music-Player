import type { PlaylistDuplicateTrack } from '@ton/core';
import { Dialog } from '../../../components/ui/dialog';

export interface PlaylistDuplicateDialogState {
  currentIndex: number;
  duplicates: PlaylistDuplicateTrack[];
  isBulk: boolean;
}

export function PlaylistDuplicateDialog({
  state,
  onAddAll,
  onAddCurrent,
  onCancel,
  onSkip,
  t,
}: {
  state: PlaylistDuplicateDialogState;
  onAddAll: () => void;
  onAddCurrent: () => void;
  onCancel: () => void;
  onSkip: () => void;
  t: (key: string, values?: Record<string, unknown>) => string;
}) {
  const duplicate = state.duplicates[state.currentIndex];
  const buttonStyle = {
    borderRadius: '999px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.78rem',
    fontWeight: 600,
    padding: '9px 14px',
  } as const;

  return (
    <Dialog open onClose={onCancel} title={t('duplicatePlaylistTitle')} width="440px">
      {state.isBulk && (
        <p style={{ color: '#ff6262', fontSize: '0.72rem', fontWeight: 650, marginBottom: '8px' }}>
          {t('duplicatePlaylistProgress', {
            current: state.currentIndex + 1,
            total: state.duplicates.length,
          })}
        </p>
      )}
      <p style={{ color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
        {t('duplicatePlaylistMessage', { title: duplicate.title })}
      </p>
      {duplicate.artist && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginTop: '4px' }}>
          {duplicate.artist}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2" style={{ marginTop: '22px' }}>
        {!state.isBulk ? (
          <>
            <button onClick={onCancel} style={{ ...buttonStyle, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {t('cancel')}
            </button>
            <button onClick={onAddCurrent} style={{ ...buttonStyle, background: 'var(--white)', border: '1px solid var(--white)', color: 'var(--bg-deep)' }}>
              {t('duplicatePlaylistAddAgain')}
            </button>
          </>
        ) : (
          <>
            <button onClick={onSkip} style={{ ...buttonStyle, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {t('duplicatePlaylistSkip')}
            </button>
            <button onClick={onAddCurrent} style={{ ...buttonStyle, background: 'transparent', border: '1px solid var(--white)', color: 'var(--white)' }}>
              {t('duplicatePlaylistAddThis')}
            </button>
            <button onClick={onAddAll} style={{ ...buttonStyle, background: 'var(--white)', border: '1px solid var(--white)', color: 'var(--bg-deep)' }}>
              {t('duplicatePlaylistAddAll')}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
