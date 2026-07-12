import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CoverImage } from '../../components/cover-image';
import { AutoMarqueeText } from '../../components/auto-marquee-text';

type PlaylistHeroProps = {
  name: string;
  coverPath?: string | null;
  metaText: string;
  showPlayAll: boolean;
  playAllLabel: string;
  editLabel: string;
  actionsDisabled?: boolean;
  topSpacing?: number;
  onPlayAll: () => void;
  onOpenActions: () => void;
};

export function PlaylistHero({
  name,
  coverPath,
  metaText,
  showPlayAll,
  playAllLabel,
  editLabel,
  actionsDisabled = false,
  topSpacing = 24,
  onPlayAll,
  onOpenActions,
}: PlaylistHeroProps) {
  return (
    <View className="items-center pb-6" style={{ paddingTop: topSpacing }}>
      <CoverImage uri={coverPath} size={160} borderRadius={8} />
      <AutoMarqueeText
        active
        align="center"
        text={name}
        className="text-white text-xl font-bold"
        containerStyle={{ alignSelf: 'stretch', marginHorizontal: 24, marginTop: 16 }}
      />
      <Text className="text-text-muted text-xs mt-1">{metaText}</Text>
      <View className="flex-row items-center justify-center mt-4 gap-3">
        {showPlayAll && (
          <Pressable
            onPress={onPlayAll}
            className="flex-row items-center bg-white px-5 py-2 rounded-full"
          >
            <Feather name="play" size={16} color="#050505" />
            <Text className="text-black text-sm font-semibold ml-1">{playAllLabel}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onOpenActions}
          disabled={actionsDisabled}
          className="flex-row items-center border border-border px-4 py-2 rounded-full"
          style={{ opacity: actionsDisabled ? 0.5 : 1 }}
        >
          <Feather name="edit-2" size={15} color="#e8e8e8" />
          <Text className="text-text-primary text-sm font-semibold ml-2">{editLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
