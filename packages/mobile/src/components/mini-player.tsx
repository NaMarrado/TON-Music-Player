import { View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../stores/playback-store';
import { toggle } from '../services/playback-bridge';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { VolumeControl } from '../screens/now-playing-screen/volume-control';
import { AutoMarqueeText } from './auto-marquee-text';

export function MiniPlayer() {
  const { t } = useTranslation('common');
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const volumePercent = usePlaybackStore((s) => s.volumePercent);
  const isMuted = usePlaybackStore((s) => s.isMuted);

  if (!currentTrack) return null;

  return (
    <View className="bg-bg-elevated border-t border-border">
      <Pressable onPress={() => navigation.navigate('NowPlaying')}>
        <View className="flex-row items-center px-4 py-2">
          {currentTrack.cover_art_path ? (
            <Image
              source={{ uri: currentTrack.cover_art_path }}
              style={{ width: 44, height: 44, borderRadius: 4 }}
              contentFit="cover"
            />
          ) : (
            <View className="w-11 h-11 rounded bg-bg-surface items-center justify-center">
              <Feather name="music" size={20} color="#555" />
            </View>
          )}

          <View className="flex-1 ml-3 mr-2">
            <AutoMarqueeText
              active
              text={currentTrack.title ?? t('unknown_title')}
              className="text-white text-sm font-medium"
            />
            <AutoMarqueeText
              active
              text={currentTrack.artist ?? t('unknown_artist')}
              className="text-text-secondary text-xs"
            />
          </View>

          <Pressable
            onPress={(e) => { e.stopPropagation(); toggle(); }}
            hitSlop={12}
            className="p-2"
          >
            <Feather
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color="#e8e8e8"
            />
          </Pressable>
        </View>
      </Pressable>
      <VolumeControl volumePercent={volumePercent} isMuted={isMuted} variant="compact" />
    </View>
  );
}
