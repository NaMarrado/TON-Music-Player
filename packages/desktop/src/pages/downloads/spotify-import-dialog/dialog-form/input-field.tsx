import type { DialogFormProps } from './types';

type DialogInputFieldProps = Pick<
  DialogFormProps,
  'inputRef' | 'isLoading' | 'onClose' | 'onImport' | 'onSetUrl' | 't' | 'url'
>;

export function DialogInputField({
  inputRef,
  isLoading,
  onClose,
  onImport,
  onSetUrl,
  t,
  url,
}: DialogInputFieldProps) {
  return (
    <div className="relative">
      <svg
        className="absolute pointer-events-none"
        style={{
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '16px',
          height: '16px',
          color: 'var(--text-secondary)',
        }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        className="w-full outline-none"
        placeholder={t('importPlaceholder')}
        value={url}
        onChange={(event) => onSetUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && url.trim() && !isLoading) {
            onImport();
          }
          if (event.key === 'Escape') {
            onClose();
          }
        }}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '11px 14px 11px 40px',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '0.88rem',
          transition: 'var(--transition)',
        }}
      />
    </div>
  );
}
