import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setStudioTabEnabled, useStudioTabStore } from '../../stores/studio-tab-store';
import { CompactToggle, SectionHeader, SettingsCard } from './primitives';

/** Switches the Studio tab on or off. It is off by default, so it does not take room in the tab bar for everyone. */
export function StudioTabCard() {
  const { t } = useTranslation('settings');
  const enabled = useStudioTabStore((state) => state.enabled);
  return (
    <SettingsCard>
      <SectionHeader icon="sliders" title={t('studioTabTitle')} />
      <View className="ml-[38px] flex-row items-center justify-between">
        <Text className="text-text-secondary text-[12.5px] flex-1 pr-3">{t('studioTabText')}</Text>
        <CompactToggle accessibilityLabel={t('studioTabTitle')} value={enabled} onValueChange={(value) => { void setStudioTabEnabled(value); }} />
      </View>
    </SettingsCard>
  );
}
