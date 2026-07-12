import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/empty-state';

interface Props {
  isSearching: boolean;
  query: string;
}

export function SearchEmptyState({ isSearching, query }: Props) {
  const { t } = useTranslation('search');

  if (isSearching) {
    return null;
  }

  if (query.trim().length > 0) {
    return <EmptyState message={t('noResults')} />;
  }

  return (
    <EmptyState
      message={t('emptyHint')}
      icon={<Feather name="search" size={48} color="#555" />}
    />
  );
}
