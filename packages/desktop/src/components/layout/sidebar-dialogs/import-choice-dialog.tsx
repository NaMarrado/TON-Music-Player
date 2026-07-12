import { Dialog } from '../../ui/dialog';

export function ImportChoiceDialog({
  duplicateInfo,
  onCancel,
  onChoice,
  t,
}: {
  t: (key: string, vars?: Record<string, unknown>) => string;
  duplicateInfo: { total: number; existing: number } | null;
  onChoice: (skipExisting: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onClose={onCancel} title={t('importLibraryTitle')}>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          lineHeight: '1.5',
          marginBottom: '24px',
        }}
      >
        {duplicateInfo
          ? t('importLibraryDescCount', {
              total: duplicateInfo.total,
              existing: duplicateInfo.existing,
            })
          : t('importLibraryDesc')}
      </p>
      <div className="flex justify-end gap-2">
        <button
          className="download-btn cursor-pointer"
          onClick={() => onChoice(true)}
          style={{
            padding: '10px 20px',
            borderRadius: '20px',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'all var(--transition)',
          }}
        >
          {t('skipExisting')}
        </button>
        <button
          className="play-all-btn cursor-pointer"
          onClick={() => onChoice(false)}
          style={{
            padding: '10px 20px',
            borderRadius: '20px',
            background: 'var(--white)',
            color: 'var(--bg-deep)',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          {t('importAll')}
        </button>
      </div>
    </Dialog>
  );
}
