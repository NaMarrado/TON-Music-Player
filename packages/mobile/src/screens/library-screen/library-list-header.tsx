import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  formatTime,
  formatTrackFileSizeSummary,
  summarizeTrackFileSizes,
  type Playlist,
  type Track,
} from '@ton/core';
import type { LibraryStackParamList } from '../../types/navigation';
import { PlaylistStrip } from './playlist-strip';
import { SongsHeader } from './songs-header';

export function LibraryListHeader({
  playlists,
  filterQuery,
  tracks,
  onCreatePlaylist,
  onPlayAll,
}: {
  playlists: Playlist[];
  filterQuery: string;
  tracks: Track[];
  onCreatePlaylist: () => void;
  onPlayAll: () => void;
}) {
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0);
  const summaryLabel = [
    tc('track', { count: tracks.length }),
    formatTime(totalDuration),
    formatTrackFileSizeSummary(summarizeTrackFileSizes(tracks)),
  ].join(' · ');

  return (
    <>
      <PlaylistStrip
        label={t('playlistsSection')}
        newPlaylistLabel={t('newPlaylist')}
        playlists={playlists}
        onCreatePress={onCreatePlaylist}
        onPlaylistPress={(id) => navigation.navigate('Playlist', { id })}
      />
      <SongsHeader
        sectionLabel={t('songsSection')}
        filterValue={filterQuery}
        filterPlaceholder={t('filterPlaceholder')}
        showPlayAll={tracks.length > 0}
        playAllLabel={t('playAll')}
        summaryLabel={summaryLabel}
        onPlayAll={onPlayAll}
      />
    </>
  );
}
