import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Track } from '@ton/core';
import type { ArtistParams } from '../types/navigation';
import { useLibraryStore } from '../stores/library-store';
import { playTracks, playSingleTrack } from '../services/playback-bridge';
import { TrackRow } from '../components/track-row';
import { CoverImage } from '../components/cover-image';
import { EmptyState } from '../components/empty-state';
import { ActionSheet, type ActionSheetOption } from '../components/action-sheet';
import { PlaylistPicker } from '../components/playlist-picker';
import { useScreenTopPadding } from '../hooks/use-screen-top-padding';

type Props = { route: { params: ArtistParams } };

export function ArtistScreen({ route }: Props) {
  const { name } = route.params;
  const { t } = useTranslation('artist');
  const { t: tc } = useTranslation('common');
  const allTracks = useLibraryStore((s) => s.tracks);
  const topPadding = useScreenTopPadding(24);
  const tracks = useMemo(
    () => allTracks.filter((tr) => tr.artist === name),
    [allTracks, name],
  );

  const handlePlay = useCallback((index: number) => {
    playTracks(tracks, index, { kind: 'artist', source_id: name });
  }, [name, tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTracks(tracks, 0, { kind: 'artist', source_id: name });
  }, [name, tracks]);

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
            <CoverImage uri={coverArt} size={120} borderRadius={60} />
            <Text className="text-white text-xl font-bold mt-4">{name}</Text>
            <Text className="text-text-secondary text-sm mt-1">
              {tc('track', { count: tracks.length })}
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
        ListEmptyComponent={<EmptyState message={t('emptyArtist')} />}
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
