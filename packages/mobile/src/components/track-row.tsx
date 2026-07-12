import { memo, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Track } from '@ton/core';
import { formatTime } from '@ton/core';
import { CoverImage } from './cover-image';
import { usePlaybackStore } from '../stores/playback-store';
import { AutoMarqueeText } from './auto-marquee-text';

interface TrackRowProps {
  track: Track;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  leadingAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  selected?: boolean;
  selectionMode?: boolean;
}

export const TrackRow = memo(function TrackRow({
  track,
  onPress,
  onLongPress,
  disabled = false,
  leadingAccessory,
  rightAccessory,
  selected = false,
  selectionMode = false,
}: TrackRowProps) {
  const { t } = useTranslation('common');
  const playbackState = usePlaybackStore((state) => {
    const isCurrentTrack = state.currentTrack?.id === track.id;
    if (!isCurrentTrack) {
      return 'idle';
    }
    return state.isPlaying ? 'playing' : 'paused';
  });
  const isActive = playbackState !== 'idle';
  const isPlaying = playbackState === 'playing';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      className={`flex-row items-center px-4 ${selected ? 'bg-bg-surface' : ''}`}
      style={{ height: 56, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' }}
      android_ripple={disabled ? undefined : { color: 'rgba(255,255,255,0.08)' }}
    >
      {leadingAccessory}
      <CoverImage uri={track.cover_art_path} size={42} borderRadius={6} />
      <View className="flex-1 ml-3 mr-2">
        <AutoMarqueeText
          active={isActive}
          text={track.title ?? t('unknown_title')}
          className={`text-[13px] font-medium ${isActive ? 'text-white' : 'text-text-primary'}`}
        />
        <AutoMarqueeText
          active={isActive}
          text={track.artist ?? t('unknown_artist')}
          className="text-text-secondary text-xs mt-0.5"
        />
      </View>
      {selectionMode && (
        <Feather
          name={selected ? 'check-circle' : 'circle'}
          size={18}
          color={selected ? '#ffffff' : '#666'}
          style={{ marginRight: 10 }}
        />
      )}
      {isActive && isPlaying && (
        <Feather name="volume-2" size={14} color="#fff" style={{ marginRight: 8 }} />
      )}
      {track.duration_ms != null && (
        <Text className="text-text-muted text-xs" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(track.duration_ms)}
        </Text>
      )}
      {rightAccessory}
    </Pressable>
  );
});
