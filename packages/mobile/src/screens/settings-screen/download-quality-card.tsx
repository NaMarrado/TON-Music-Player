import { Switch, Text, View } from 'react-native';
import type { DownloadQualityProfile } from '@ton/core';
import { SectionHeader, SettingsCard } from './primitives';

export function DownloadQualityCard({
  profile,
  title,
  description,
  warning,
  onChange,
}: {
  profile: DownloadQualityProfile;
  title: string;
  description: string;
  warning: string;
  onChange: (profile: DownloadQualityProfile) => void;
}) {
  const best = profile === 'best_compatible';
  return (
    <SettingsCard>
      <View
        className="rounded-xl border px-4 py-4"
        style={{
          borderColor: 'rgba(214, 170, 106, 0.5)',
          backgroundColor: 'rgba(214, 170, 106, 0.08)',
        }}
      >
        <SectionHeader
          icon="download"
          title={title}
          description={description}
          right={(
            <Switch
              value={best}
              onValueChange={(enabled) => onChange(enabled ? 'best_compatible' : 'normal')}
              trackColor={{ false: '#333', true: '#d6aa6a' }}
              thumbColor={best ? '#fff' : '#888'}
              ios_backgroundColor="#333"
              style={{ transform: [{ scaleX: 1.08 }, { scaleY: 1.08 }] }}
            />
          )}
        />
        <View className="ml-[38px] pt-1">
          <Text className="text-[#d6aa6a] text-xs leading-[18px]">{warning}</Text>
        </View>
      </View>
    </SettingsCard>
  );
}
