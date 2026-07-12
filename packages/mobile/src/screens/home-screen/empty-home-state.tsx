import { Feather } from '@expo/vector-icons';
import { EmptyState } from '../../components/empty-state';

interface EmptyHomeStateProps {
  actionLabel: string;
  message: string;
  onAction: () => void;
}

export function EmptyHomeState({
  actionLabel,
  message,
  onAction,
}: EmptyHomeStateProps) {
  return (
    <EmptyState
      message={message}
      icon={<Feather name="music" size={32} color="#888" />}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
