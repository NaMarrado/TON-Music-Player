import { FlatList, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type PlaylistItem = {
  id: number;
  name: string;
};

interface Props {
  playlists: PlaylistItem[];
  onShowCreate: () => void;
  onSelect: (playlistId: number, playlistName: string) => void;
  bottomSpacerHeight: number;
}

export function PlaylistPickerList({
  playlists,
  onShowCreate,
  onSelect,
  bottomSpacerHeight,
}: Props) {
  const { t } = useTranslation('library');

  return (
    <>
      <Pressable
        onPress={onShowCreate}
        className="flex-row items-center px-5 py-3"
      >
        <View className="w-10 h-10 bg-bg-elevated rounded items-center justify-center">
          <Feather name="plus" size={20} color="#e8e8e8" />
        </View>
        <Text className="text-text-primary text-sm font-medium ml-3">
          {t('createPlaylist')}
        </Text>
      </Pressable>

      <FlatList
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id, item.name)}
            className="flex-row items-center px-5 py-3"
          >
            <View className="w-10 h-10 bg-bg-elevated rounded items-center justify-center">
              <Feather name="music" size={18} color="#e8e8e8" />
            </View>
            <Text className="text-text-primary text-sm font-medium ml-3" numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text className="text-text-secondary text-sm px-5 py-4 text-center">
            {t('noPlaylists')}
          </Text>
        }
        style={{ maxHeight: 300 }}
      />

      <View style={{ height: bottomSpacerHeight }} />
    </>
  );
}
