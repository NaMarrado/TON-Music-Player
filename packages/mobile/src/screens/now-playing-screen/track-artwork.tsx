import { View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';

export function TrackArtwork({
  coverArtPath,
  size,
}: {
  coverArtPath: string | null | undefined;
  size: number;
}) {
  if (coverArtPath) {
    return (
      <Image
        source={{ uri: coverArtPath }}
        style={{ width: size, height: size, borderRadius: 12 }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      className="rounded-xl bg-bg-elevated items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Feather name="disc" size={80} color="#555" />
    </View>
  );
}
