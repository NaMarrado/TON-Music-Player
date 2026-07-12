import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Track } from '@ton/core';
import { formatTime } from '@ton/core';
import type { AlbumParams } from '../types/navigation';
import { useLibraryStore } from '../stores/library-store';
import { playTracks, playSingleTrack } from '../services/playback-bridge';
import { TrackRow } from '../components/track-row';
import { CoverImage } from '../components/cover-image';
import { EmptyState } from '../components/empty-state';
import { ActionSheet, type ActionSheetOption } from '../components/action-sheet';
import { PlaylistPicker } from '../components/playlist-picker';
import { useScreenTopPadding } from '../hooks/use-screen-top-padding';

type Props = { route: { params: AlbumParams } };

export function AlbumScreen({ route }: Props) {
  const { name, artist } = route.params;
  const { t } = useTranslation('album');
  const { t: tc } = useTranslation('common');
  const allTracks = useLibraryStore((s) => s.tracks);
  const topPadding = useScreenTopPadding(24);
  const tracks = useMemo(
    () => allTracks
      .filter((tr) => tr.album === name && (!artist || tr.artist === artist))
      .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0)),
    [allTracks, name, artist],
  );

  const handlePlay = useCallback((index: number) => {
    playTracks(tracks, index);
  }, [tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTracks(tracks, 0);
  }, [tracks]);

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<Track | null>(null);

  const trackActions: ActionSheetOption[] = selectedTrack ? [
    {
      label: t('play'),
      icon: 'play',
      onPress: () => { if (selectedTrack) playSingleTrack(selectedTrack); },
    },
    {
      label: t('addToPlaylist'),
      icon: 'plus-circle',
      onPress: () => { if (selectedTrack) setPlaylistPickerTrack(selectedTrack); },
    },
  ] : [];

  const coverArt = tracks[0]?.cover_art_path ?? null;
  const totalMs = tracks.reduce((sum, tr) => sum + (tr.duration_ms ?? 0), 0);

  return (
    <View className="flex-1 bg-bg-deep">
      <FlashList
        data={tracks}
        keyExtractor={(item) => String(item.id)}
        estimatedItemSize={56}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            onPress={() => handlePlay(index)}
            onLongPress={() => setSelectedTrack(item)}
          />
        )}
        ListHeaderComponent={
          <View className="items-center pb-6" style={{ paddingTop: topPadding }}>
            <CoverImage uri={coverArt} size={180} borderRadius={8} />
            <Text className="text-white text-xl font-bold mt-4">{name}</Text>
            {artist && (
              <Text className="text-text-secondary text-sm mt-1">{artist}</Text>
            )}
            <Text className="text-text-muted text-xs mt-1">
              {tc('track', { count: tracks.length })}
              {totalMs > 0 ? ` · ${formatTime(totalMs)}` : ''}
            </Text>
            {tracks.length > 0 && (
              <Pressable
                onPress={handlePlayAll}
                className="mt-4 flex-row items-center bg-white px-5 py-2 rounded-full"
              >
                <Feather name="play" size={16} color="#050505" />
                <Text className="text-black text-sm font-semibold ml-1">{t('playAll')}</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState message={t('emptyAlbum')} />}
      />

      <ActionSheet
        visible={selectedTrack !== null}
        title={selectedTrack?.title ?? undefined}
        options={trackActions}
        onClose={() => setSelectedTrack(null)}
      />

      {playlistPickerTrack && (
        <PlaylistPicker
          visible
          trackId={playlistPickerTrack.id}
          onClose={() => setPlaylistPickerTrack(null)}
        />
      )}
    </View>
  );
}
