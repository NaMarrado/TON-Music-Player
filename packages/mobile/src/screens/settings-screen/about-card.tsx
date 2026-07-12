import { Text, View } from 'react-native';
import { SectionHeader, SettingsCard } from './primitives';

export function AboutCard({
  title,
  versionLabel,
  versionText,
  desktopOnlyText,
}: {
  title: string;
  versionLabel: string;
  versionText: string;
  desktopOnlyText: string;
}) {
  return (
    <SettingsCard>
      <SectionHeader icon="info" title={title} />
      <View className="ml-[38px]">
        <Text className="text-text-primary text-sm font-medium">{versionLabel}</Text>
        <Text className="text-text-secondary text-xs mt-2">{versionText}</Text>
        <Text className="text-text-muted text-xs mt-1">{desktopOnlyText}</Text>
      </View>
    </SettingsCard>
  );
}
