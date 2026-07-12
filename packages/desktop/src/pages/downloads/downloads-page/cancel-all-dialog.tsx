import { Dialog } from '../../../components/ui/dialog';

export function CancelAllDialog({
  cancelLabel,
  confirmLabel,
  description,
  isCancelling,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isCancelling: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <Dialog open onClose={isCancelling ? () => {} : onCancel} title={title}>
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          marginBottom: '24px',
        }}
      >
        {description}
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          disabled={isCancelling}
          onClick={onCancel}
          style={{
            padding: '9px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            cursor: isCancelling ? 'default' : 'pointer',
            opacity: isCancelling ? 0.55 : 1,
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={isCancelling}
          onClick={onConfirm}
          style={{
            padding: '9px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.65)',
            background: 'rgba(239, 68, 68, 0.14)',
            color: '#f87171',
            cursor: isCancelling ? 'default' : 'pointer',
            opacity: isCancelling ? 0.55 : 1,
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
