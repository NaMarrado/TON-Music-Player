import { useMemo } from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SearchSource } from '@ton/core';
import { getSearchSourceLabel } from '../services/search-source-label';

type ActiveTab = SearchSource | 'all';

interface SourceTabsProps {
  activeTab: ActiveTab;
  counts: Record<string, number>;
  onTabChange: (tab: ActiveTab) => void;
}

export function SourceTabs({ activeTab, counts, onTabChange }: SourceTabsProps) {
  const { t } = useTranslation('common');
  const tabs: { key: ActiveTab; label: string }[] = useMemo(() => [
    { key: 'all', label: t('all') },
    { key: 'youtube', label: getSearchSourceLabel('youtube', t) },
    { key: 'spotify', label: getSearchSourceLabel('spotify', t) },
    { key: 'local', label: getSearchSourceLabel('local', t) },
    { key: 'playlist', label: getSearchSourceLabel('playlist', t) },
  ], [t]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}
    >
      {tabs.map((tab) => {
        const count = counts[tab.key] ?? 0;
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            className={`px-3 py-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-bg-elevated'}`}
          >
            <Text
              className={`text-xs font-semibold ${isActive ? 'text-black' : 'text-text-secondary'}`}
            >
              {tab.label}{count > 0 ? ` (${count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
