export function DeleteControls({
  deleteConfirm,
  onDelete,
  onSetDeleteConfirm,
  t,
}: {
  deleteConfirm: boolean;
  onDelete: () => void;
  onSetDeleteConfirm: (value: boolean) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  if (!deleteConfirm) {
    return (
      <button
        className="cursor-pointer"
        onClick={() => onSetDeleteConfirm(true)}
        style={{
          padding: '5px 12px',
          borderRadius: '16px',
          background: 'transparent',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          color: '#f87171',
          fontSize: '0.75rem',
          fontFamily: 'inherit',
          transition: 'all var(--transition)',
        }}
      >
        {t('delete')}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        className="cursor-pointer"
        onClick={onDelete}
        style={{
          padding: '5px 12px',
          borderRadius: '16px',
          background: 'rgba(248, 113, 113, 0.15)',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          color: '#f87171',
          fontSize: '0.72rem',
          fontFamily: 'inherit',
          transition: 'all var(--transition)',
        }}
      >
        {t('confirmDelete')}
      </button>
      <button
        className="cursor-pointer"
        onClick={() => onSetDeleteConfirm(false)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.78rem',
          fontFamily: 'inherit',
          padding: '2px',
        }}
      >
        ✕
      </button>
    </div>
  );
}
