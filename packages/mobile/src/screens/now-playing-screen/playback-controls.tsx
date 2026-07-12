import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { nextTrack, prevTrack, toggle, toggleRepeat, toggleShuffle } from '../../services/playback-bridge';

type PlaybackControlsProps = {
  isPlaying: boolean;
  shuffle: boolean;
  repeat: string;
};

export function PlaybackControls({
  isPlaying,
  shuffle,
  repeat,
}: PlaybackControlsProps) {
  return (
    <View className="flex-row items-center justify-between px-10 mt-4">
      <Pressable onPress={toggleShuffle} hitSlop={12}>
        <Feather name="shuffle" size={22} color={shuffle ? '#fff' : '#555'} />
      </Pressable>

      <Pressable onPress={() => prevTrack()} hitSlop={12}>
        <Feather name="skip-back" size={32} color="#e8e8e8" />
      </Pressable>

      <Pressable
        onPress={toggle}
        className="w-16 h-16 rounded-full bg-white items-center justify-center"
      >
        <Feather
          name={isPlaying ? 'pause' : 'play'}
          size={30}
          color="#050505"
          style={isPlaying ? undefined : { marginLeft: 3 }}
        />
      </Pressable>

      <Pressable onPress={() => nextTrack()} hitSlop={12}>
        <Feather name="skip-forward" size={32} color="#e8e8e8" />
      </Pressable>

      <Pressable onPress={toggleRepeat} hitSlop={12}>
        <Feather name="repeat" size={22} color={repeat === 'one' ? '#fff' : '#555'} />
        {repeat === 'one' && (
          <View className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-white items-center justify-center px-[3px]">
            <Text className="text-black text-[9px] font-extrabold leading-[10px]">
              1
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
