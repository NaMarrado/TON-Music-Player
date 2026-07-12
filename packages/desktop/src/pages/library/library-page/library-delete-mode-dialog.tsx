import { Dialog } from '../../../components/ui/dialog';

export function LibraryDeleteModeDialog({
  count,
  onCancel,
  onDeleteEverywhere,
  onRemoveFromLibraryOnly,
  t,
}: {
  count: number;
  onCancel: () => void;
  onDeleteEverywhere: () => void;
  onRemoveFromLibraryOnly: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog open onClose={onCancel} title={t('deleteModeTitle', { count })}>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: '24px',
        }}
      >
        {t('deleteModeDescription', { count })}
      </p>
      <div className="flex justify-end gap-3">
        <button
          className="cursor-pointer"
          onClick={onCancel}
          style={{
            padding: '9px 14px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          {t('cancel')}
        </button>
        <button
          className="cursor-pointer"
          onClick={onRemoveFromLibraryOnly}
          style={{
            padding: '9px 14px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          {t('removeOnlyFromLibrary')}
        </button>
        <button
          className="cursor-pointer"
          onClick={onDeleteEverywhere}
          style={{
            padding: '9px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            background: 'rgba(248, 113, 113, 0.14)',
            color: '#f87171',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          {t('deleteEverywhere')}
        </button>
      </div>
    </Dialog>
  );
}
