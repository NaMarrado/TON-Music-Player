import { useCallback } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../stores/playback-store';
import { seek } from '../../services/playback-bridge';
import type { RootStackParamList } from '../../types/navigation';
import { useTrackProgress } from '../../hooks/use-track-progress';
import { PlaybackControls } from './playback-controls';
import { NowPlayingHeader } from './now-playing-header';
import { ProgressSection } from './progress-section';
import { TrackArtwork } from './track-artwork';
import { VolumeControl } from './volume-control';
import { AutoMarqueeText } from '../../components/auto-marquee-text';

const ARTWORK_HORIZONTAL_INSET = 40;
const CONTENT_BOTTOM_PADDING = 16;

export function NowPlayingScreen() {
  const { t } = useTranslation('nowPlaying');
  const { t: tc } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'NowPlaying'>>();
  const currentTrack = usePlaybackStore((state) => state.currentTrack);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const shuffle = usePlaybackStore((state) => state.shuffle);
  const repeat = usePlaybackStore((state) => state.repeat);
  const volumePercent = usePlaybackStore((state) => state.volumePercent);
  const isMuted = usePlaybackStore((state) => state.isMuted);
  const { position, duration } = useTrackProgress(250);
  const { width: screenWidth } = useWindowDimensions();
  const artSize = screenWidth - (ARTWORK_HORIZONTAL_INSET * 2);

  const handleSeek = useCallback((value: number) => {
    seek(value);
  }, []);

  if (!currentTrack) {
    return (
      <View className="flex-1 bg-bg-deep items-center justify-center">
        <Text className="text-text-muted text-base">{t('noTrack')}</Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-bg-deep"
      style={{ paddingTop: insets.top }}
    >
      <NowPlayingHeader title={t('title')} onBack={() => navigation.goBack()} />

      <ScrollView
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, CONTENT_BOTTOM_PADDING),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-grow justify-evenly">
          <View className="items-center px-10 pt-2">
            <TrackArtwork coverArtPath={currentTrack.cover_art_path} size={artSize} />
          </View>

          <View className="px-6 mt-6">
            <AutoMarqueeText
              active
              text={currentTrack.title ?? tc('unknown_title')}
              className="text-white text-xl font-bold"
            />
            <AutoMarqueeText
              active
              text={currentTrack.artist ?? tc('unknown_artist')}
              className="text-text-secondary text-base mt-1"
            />
          </View>

          <ProgressSection position={position} duration={duration} onSeekComplete={handleSeek} />
          <PlaybackControls isPlaying={isPlaying} shuffle={shuffle} repeat={repeat} />
          <VolumeControl volumePercent={volumePercent} isMuted={isMuted} variant="full" />
        </View>
      </ScrollView>
    </View>
  );
}
