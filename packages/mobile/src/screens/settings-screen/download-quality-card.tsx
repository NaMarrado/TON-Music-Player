import { Text, View } from 'react-native';
import type { DownloadQualityProfile } from '@ton/core';
import { CompactToggle, SectionHeader, SettingsCard } from './primitives';

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
          borderColor: best ? 'rgba(214, 170, 106, 0.5)' : 'rgba(255, 255, 255, 0.08)',
          backgroundColor: best ? 'rgba(214, 170, 106, 0.08)' : 'transparent',
        }}
      >
        <SectionHeader
          icon="download"
          title={title}
          description={description}
          right={(
            <CompactToggle
              accessibilityLabel={title}
              value={best}
              onValueChange={(enabled) => onChange(enabled ? 'best_compatible' : 'normal')}
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
