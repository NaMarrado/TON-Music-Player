import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface Props {
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export function SearchSpotifyError({ onOpenSettings, onDismiss }: Props) {
  const { t } = useTranslation('search');

  return (
    <View className="mx-4 mt-2 px-3 py-2 rounded-lg bg-bg-surface border border-border">
      <View className="flex-row items-center">
        <Text
          style={{
            color: '#22c55e',
            fontWeight: '600',
            fontSize: 10,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            marginRight: 8,
          }}
        >
          Spotify
        </Text>
        <Text className="text-text-secondary text-xs flex-1">{t('spotifyError')}</Text>
        <Pressable
          onPress={onOpenSettings}
          className="ml-2"
        >
          <Text className="text-text-primary text-xs underline">{t('openSettings')}</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} className="ml-2">
          <Feather name="x" size={14} color="#888" />
        </Pressable>
      </View>
    </View>
  );
}
