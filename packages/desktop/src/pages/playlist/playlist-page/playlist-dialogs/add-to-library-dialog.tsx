import { Dialog } from '../../../../components/ui/dialog';
import { SecondaryButton } from './buttons';

export function AddToLibraryDialog({
  libraryCounts,
  onAddAll,
  onAddOnlyNew,
  onClose,
  t,
}: {
  libraryCounts: { total: number; alreadyInLibrary: number; newTracks: number };
  onAddAll: () => void;
  onAddOnlyNew: () => void;
  onClose: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog open onClose={onClose} title={t('addToLibraryTitle')}>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: '20px',
        }}
      >
        {t('addToLibraryDesc', {
          total: libraryCounts.total,
          inLibrary: libraryCounts.alreadyInLibrary,
          notInLibrary: libraryCounts.newTracks,
        })}
      </p>
      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={onClose}>{t('cancel')}</SecondaryButton>
        {libraryCounts.newTracks > 0 && libraryCounts.alreadyInLibrary > 0 && (
          <SecondaryButton onClick={onAddOnlyNew}>
            {t('addOnlyNew', { count: libraryCounts.newTracks })}
          </SecondaryButton>
        )}
        <button
          className="rounded-lg cursor-pointer"
          onClick={onAddAll}
          style={{
            padding: '9px 18px',
            background: 'var(--white)',
            color: 'var(--bg-deep)',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          {t('addAll', { count: libraryCounts.total })}
        </button>
      </div>
    </Dialog>
  );
}
