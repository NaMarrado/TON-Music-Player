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
}) {
  const isBusy = isExporting || isImporting;

  return (
    <SettingsCard>
      <SectionHeader icon="folder" title={title} />
      <View className="ml-[38px] gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={onExport}
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
