import { Switch, Text, View } from 'react-native';
import type { DownloadQualityProfile } from '@ton/core';
import { SectionHeader, SettingsCard } from './primitives';

export function DownloadQualityCard({
  profile,
  title,
  description,
  normalLabel,
  bestLabel,
  warning,
  onChange,
}: {
  profile: DownloadQualityProfile;
  title: string;
  description: string;
  normalLabel: string;
  bestLabel: string;
  warning: string;
  onChange: (profile: DownloadQualityProfile) => void;
}) {
  const best = profile === 'best_compatible';
  return (
    <SettingsCard>
      <SectionHeader
        icon="download"
        title={title}
        description={description}
        right={(
          <Switch
            value={best}
            onValueChange={(enabled) => onChange(enabled ? 'best_compatible' : 'normal')}
            trackColor={{ false: '#333', true: '#555' }}
            thumbColor={best ? '#fff' : '#888'}
          />
        )}
      />
      <View className="ml-[38px] gap-1.5">
        <Text className="text-text-primary text-xs">{best ? bestLabel : normalLabel}</Text>
        <Text className="text-[#d6aa6a] text-xs">{warning}</Text>
      </View>
    </SettingsCard>
  );
}
