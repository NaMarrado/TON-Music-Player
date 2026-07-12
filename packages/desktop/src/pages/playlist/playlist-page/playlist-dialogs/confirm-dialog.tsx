import { Dialog } from '../../../../components/ui/dialog';
import { DestructiveButton, SecondaryButton } from './buttons';

export function ConfirmDialog({
  description,
  onCancel,
  onConfirm,
  title,
  t,
}: {
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  t: (key: string) => string;
}) {
  return (
    <Dialog open onClose={onCancel} title={title}>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: '24px',
        }}
      >
        {description}
      </p>
      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={onCancel}>{t('cancel')}</SecondaryButton>
        <DestructiveButton onClick={onConfirm}>{t('delete')}</DestructiveButton>
      </div>
    </Dialog>
  );
}
