import { ActionButton } from './action-button';
import { RemoveSelectedIcon } from './icons';

type SelectionRailProps = {
  compact: boolean;
  t: (key: string, vars?: Record<string, unknown>) => string;
  onRemoveSelected: () => void;
};

export function SelectionRail({
  compact,
  t,
  onRemoveSelected,
}: SelectionRailProps) {
  return (
    <div
      className="min-w-0"
      style={{
        width: 'min(228px, 100%)',
      }}
    >
      <ActionButton compact={compact} danger fillWidth onClick={onRemoveSelected}>
        <RemoveSelectedIcon />
        {t('delete')}
      </ActionButton>
    </div>
  );
}
