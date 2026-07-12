type EditDialogActionsProps = {
  t: (key: string) => string;
  onClose: () => void;
  onSave: () => void;
};

export function EditDialogActions({ t, onClose, onSave }: EditDialogActionsProps) {
  return (
    <div className="flex justify-end gap-3" style={{ marginTop: '24px' }}>
      <button
        className="download-btn cursor-pointer"
        onClick={onClose}
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
        {t('cancel')}
      </button>
      <button
        className="play-all-btn cursor-pointer"
        onClick={onSave}
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
        {t('save')}
      </button>
    </div>
  );
}
