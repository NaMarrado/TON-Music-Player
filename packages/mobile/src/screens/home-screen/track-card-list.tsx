import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Track } from '@ton/core';
import { CoverImage } from '../../components/cover-image';

interface TrackCardListProps {
  onPress: (track: Track) => void;
  tracks: Track[];
  unknownArtist: string;
  unknownTitle: string;
}

export const TrackCardList = memo(function TrackCardList({
  onPress,
  tracks,
  unknownArtist,
  unknownTitle,
}: TrackCardListProps) {
  return (
    <View style={{ height: 185 }}>
      <FlashList
        data={tracks}
        keyExtractor={(item) => String(item.id)}
        horizontal
        estimatedItemSize={140}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPress(item)} className="mx-1" style={{ width: 136 }}>
            <CoverImage uri={item.cover_art_path} size={136} borderRadius={8} />
            <Text className="text-text-primary text-xs font-medium mt-1.5" numberOfLines={1}>
              {item.title ?? unknownTitle}
            </Text>
            <Text className="text-text-secondary text-[10px]" numberOfLines={1}>
              {item.artist ?? unknownArtist}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
});
