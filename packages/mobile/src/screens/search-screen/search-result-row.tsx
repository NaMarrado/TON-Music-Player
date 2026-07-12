import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatTime, type SearchResult } from '@ton/core';
import { CoverImage } from '../../components/cover-image';

const SOURCE_COLORS: Record<string, string> = {
  youtube: '#ef4444',
  spotify: '#22c55e',
  local: '#3b82f6',
  playlist: '#a855f7',
};

const SOURCE_LABELS: Record<string, string> = {
  youtube: 'YT',
  spotify: 'SP',
  local: 'LIB',
  playlist: '',
};

export const SearchResultRow = memo(function SearchResultRow({
  result,
  onPress,
  onLongPress,
  onAction,
  downloadLabel,
}: {
  result: SearchResult;
  onPress: () => void;
  onLongPress: () => void;
  onAction: () => void;
  downloadLabel: string;
}) {
  const isLocal = result.source === 'local' || result.source === 'playlist';
  const isDownloaded = result.is_downloaded;
  const isPlayable = isLocal || result.library_track_id != null;
  const isRemote = !isLocal;
  const sourceColor = SOURCE_COLORS[result.source] || '#888';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-row items-center px-4"
      style={{
        height: 64,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(255,255,255,0.06)',
      }}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
    >
      <CoverImage uri={result.thumbnail_url} size={46} borderRadius={6} />
      <View className="flex-1 ml-3 mr-2">
        <View className="flex-row items-center">
          <Text className="text-text-primary text-[13px] font-medium flex-shrink" numberOfLines={1}>
            {result.title}
          </Text>
          <View
            className="ml-1.5 px-1.5 py-px rounded"
            style={{ backgroundColor: `${sourceColor}18` }}
          >
            <Text
              className="font-bold"
              style={{
                color: sourceColor,
                fontSize: 9,
                letterSpacing: 0.5,
                textTransform: result.source === 'playlist' ? 'none' : 'uppercase',
              }}
            >
              {result.source === 'playlist'
                ? (result.playlist_name || 'PL')
                : SOURCE_LABELS[result.source] || result.source.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text className="text-text-secondary text-xs mt-0.5" numberOfLines={1}>
          {result.artist}
        </Text>
      </View>

      <View className="items-end mr-2">
        {isRemote && isDownloaded && (
          <Text
            style={{ fontSize: 9, color: '#22c55e', fontWeight: '600', letterSpacing: 0.3 }}
          >
            SAVED
          </Text>
        )}
        {result.duration_ms != null && (
          <Text className="text-text-muted text-xs" style={{ fontVariant: ['tabular-nums'] }}>
            {formatTime(result.duration_ms)}
          </Text>
        )}
      </View>

      {isRemote && !isPlayable ? (
        <Pressable
          onPress={onAction}
          hitSlop={6}
          className="px-3 py-1.5 rounded-full"
          style={{
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        >
          <Text className="text-text-primary text-xs">{downloadLabel}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onAction} hitSlop={10} className="p-2">
          <Feather name="play" size={18} color="#e8e8e8" />
        </Pressable>
      )}
    </Pressable>
  );
});
