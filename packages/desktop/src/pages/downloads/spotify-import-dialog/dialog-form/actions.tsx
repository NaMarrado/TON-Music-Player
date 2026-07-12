import type { DialogFormProps } from './types';

type DialogFormActionsProps = Pick<
  DialogFormProps,
  'isLoading' | 'onClose' | 'onImport' | 't' | 'url'
>;

export function DialogFormActions({
  isLoading,
  onClose,
  onImport,
  t,
  url,
}: DialogFormActionsProps) {
  return (
    <div className="flex gap-2 justify-end" style={{ marginTop: '24px' }}>
      <button
        className="download-btn cursor-pointer"
        onClick={onClose}
        style={{
          padding: '8px 18px',
          borderRadius: '20px',
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          transition: 'all var(--transition)',
        }}
      >
        {t('cancel')}
      </button>
      <button
        className="cursor-pointer"
        onClick={onImport}
        disabled={isLoading || !url.trim()}
        style={{
          padding: '8px 20px',
          borderRadius: '20px',
          background: url.trim() && !isLoading ? 'var(--white)' : 'var(--bg-elevated)',
          color: url.trim() && !isLoading ? 'var(--bg-deep)' : 'var(--text-secondary)',
          border: 'none',
          fontSize: '0.82rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          transition: 'all var(--transition)',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: '2px solid rgba(0,0,0,0.2)',
                borderTopColor: 'var(--bg-deep)',
                animation: 'spin 0.6s linear infinite',
              }}
            />
            {t('importLoading')}
          </span>
        ) : (
          t('importAll')
        )}
      </button>
    </div>
  );
}
