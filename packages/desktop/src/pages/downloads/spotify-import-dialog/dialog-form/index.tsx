import { DialogFormActions } from './actions';
import { DialogInputField } from './input-field';
import type { DialogFormProps } from './types';

export function DialogForm({
  error,
  inputRef,
  isLoading,
  t,
  url,
  onClose,
  onImport,
  onSetUrl,
}: DialogFormProps) {
  return (
    <>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.78rem',
          marginBottom: '12px',
          lineHeight: '1.5',
        }}
      >
        {t('importHint')}
      </p>

      <DialogInputField
        inputRef={inputRef}
        isLoading={isLoading}
        onClose={onClose}
        onImport={onImport}
        onSetUrl={onSetUrl}
        t={t}
        url={url}
      />

      {error && (
        <div
          style={{
            marginTop: '10px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(255, 68, 68, 0.08)',
            border: '1px solid rgba(255, 68, 68, 0.15)',
            color: '#ff4444',
            fontSize: '0.78rem',
          }}
        >
          {error}
        </div>
      )}

      <DialogFormActions
        isLoading={isLoading}
        onClose={onClose}
        onImport={onImport}
        t={t}
        url={url}
      />
    </>
  );
}
