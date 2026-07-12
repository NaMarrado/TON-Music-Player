import { memo } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';

interface CoverImageProps {
  uri: string | null | undefined;
  size: number;
  borderRadius?: number;
}

export const CoverImage = memo(function CoverImage({ uri, size, borderRadius = 4 }: CoverImageProps) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius }}
        contentFit="cover"
        recyclingKey={uri}
      />
    );
  }

  return (
    <View
      className="bg-bg-elevated items-center justify-center"
      style={{ width: size, height: size, borderRadius }}
    >
      <Feather name="disc" size={size * 0.4} color="#555" />
    </View>
  );
});
