import { Pressable, Text, View } from 'react-native';
import { SectionHeader, SettingsCard } from './primitives';

export function ExportImportCard({
  title,
  exportLabel,
  exportingLabel,
  importLabel,
  importingLabel,
  isExporting,
  isImporting,
  onExport,
  onImport,
  description,
}: {
  title: string;
  exportLabel: string;
  exportingLabel: string;
  importLabel: string;
  importingLabel: string;
  isExporting: boolean;
  isImporting: boolean;
  onExport: () => void;
  onImport: () => void;
  /** A plain sentence under the title saying what the buttons do. */
  description?: string;
}) {
  const isBusy = isExporting || isImporting;

  return (
    <SettingsCard>
      <SectionHeader icon="folder" title={title} />
      <View className="ml-[38px] gap-3">
        {description ? <Text className="text-text-secondary text-[12.5px] leading-[18px]">{description}</Text> : null}
        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={onExport}
            accessibilityRole="button"
            accessibilityLabel={exportLabel}
            disabled={isBusy}
            className="border border-border"
            style={{
              borderRadius: 999,
              paddingVertical: 9,
              paddingHorizontal: 14,
              opacity: isBusy ? 0.7 : 1,
            }}
          >
            <Text className="text-text-primary text-[13px] font-semibold">
              {isExporting ? exportingLabel : exportLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onImport}
            accessibilityRole="button"
            accessibilityLabel={importLabel}
            disabled={isBusy}
            className="bg-white"
            style={{
              borderRadius: 999,
              paddingVertical: 9,
              paddingHorizontal: 14,
              opacity: isBusy ? 0.75 : 1,
            }}
          >
            <Text className="text-black text-[13px] font-semibold">
              {isImporting ? importingLabel : importLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </SettingsCard>
  );
}
