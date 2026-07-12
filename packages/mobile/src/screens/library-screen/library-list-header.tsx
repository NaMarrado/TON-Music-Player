import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@ton/core';
import type { LibraryStackParamList } from '../../types/navigation';
import { PlaylistStrip } from './playlist-strip';
import { SongsHeader } from './songs-header';

export function LibraryListHeader({
  playlists,
  filterQuery,
  trackCount,
  onCreatePlaylist,
  onPlayAll,
}: {
  playlists: Playlist[];
  filterQuery: string;
  trackCount: number;
  onCreatePlaylist: () => void;
  onPlayAll: () => void;
}) {
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();

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
        showPlayAll={trackCount > 0}
        playAllLabel={t('playAll')}
        trackCountLabel={tc('track', { count: trackCount })}
        onPlayAll={onPlayAll}
      />
    </>
  );
}
