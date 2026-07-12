import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import type { Playlist } from '@ton/core';
import { CoverImage } from '../../components/cover-image';

interface PlaylistCardListProps {
  onPress: (id: number) => void;
  playlists: Array<Pick<Playlist, 'id' | 'name' | 'cover_path'>>;
}

export const PlaylistCardList = memo(function PlaylistCardList({
  onPress,
  playlists,
}: PlaylistCardListProps) {
  return (
    <View style={{ height: 185 }}>
      <FlashList
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        horizontal
        estimatedItemSize={140}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPress(item.id)} className="mx-1" style={{ width: 136 }}>
            {item.cover_path ? (
              <CoverImage uri={item.cover_path} size={136} borderRadius={8} />
            ) : (
              <View
                className="items-center justify-center rounded-lg"
                style={{ width: 136, height: 136, backgroundColor: '#1a1a1a' }}
              >
                <Feather name="list" size={24} color="#888" />
              </View>
            )}
            <Text className="text-text-primary text-xs font-medium mt-1.5" numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
});
