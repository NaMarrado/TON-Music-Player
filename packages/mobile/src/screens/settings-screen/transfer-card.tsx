import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SectionHeader, SettingsCard } from './primitives';

export type TransferRow = 'profile' | 'library' | 'playlists' | 'songs';
const ROWS: Array<{ id: TransferRow; label: string }> = [
  { id: 'profile', label: 'transferProfile' },
  { id: 'library', label: 'transferLibrary' },
  { id: 'playlists', label: 'transferPlaylists' },
  { id: 'songs', label: 'transferSongs' },
];

/** Four rows (Profile, Library, Playlists, Songs), each with Export and Import. */
export function TransferCard({ busy, onExport, onImport }: { busy: boolean; onExport: (row: TransferRow) => void; onImport: (row: TransferRow) => void }) {
  const { t } = useTranslation('settings');
  return (
    <SettingsCard>
      <SectionHeader icon="folder" title={t('transferSection')} />
      <View className="ml-[38px]" style={{ gap: 10 }}>
        {ROWS.map((row) => (
          <View key={row.id} className="flex-row items-center" style={{ gap: 8 }}>
            <Text className="text-text-primary text-[13.5px]" style={{ width: 82 }}>{t(row.label)}</Text>
            <Pressable
              onPress={() => onExport(row.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${t(row.label)} ${t('transferExport')}`}
              className="bg-white rounded-full px-3.5 py-2"
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              <Text className="text-black text-[13px] font-semibold">{t('transferExport')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onImport(row.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${t(row.label)} ${t('transferImport')}`}
              className="border border-border rounded-full px-3.5 py-2"
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              <Text className="text-text-primary text-[13px] font-semibold">{t('transferImport')}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </SettingsCard>
  );
}
