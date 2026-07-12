import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SectionLabel } from '../../components/section-label';
import { EmptyHomeState } from './empty-home-state';
import { HomeHeader } from './home-header';
import { PlaylistCardList } from './playlist-card-list';
import { TrackCardList } from './track-card-list';
import { useHomeScreen } from './use-home-screen';

export function HomeScreen() {
  const { t } = useTranslation('home');
  const { t: tc } = useTranslation('common');
  const {
    handleTrackPress,
    hasLibraryLoaded,
    isLibraryLoading,
    mostPlayed,
    navigateToPlaylist,
    navigateToSearch,
    playlists,
    recentlyAdded,
    recentlyPlayed,
    tracks,
  } = useHomeScreen();

  if (!hasLibraryLoaded || isLibraryLoading) {
    return (
      <View className="flex-1 bg-bg-deep">
        <HomeHeader title={t('title')} />
        <View className="px-4 pt-4 gap-4">
          <View className="h-4 rounded-full bg-white/8" style={{ width: '40%' }} />
          <View className="h-36 rounded-2xl bg-white/6" />
          <View className="h-4 rounded-full bg-white/8" style={{ width: '35%' }} />
          <View className="h-36 rounded-2xl bg-white/6" />
        </View>
      </View>
    );
  }

  if (tracks.length === 0 && playlists.length === 0) {
    return (
      <View className="flex-1 bg-bg-deep">
        <HomeHeader title={t('title')} />
        <EmptyHomeState
          actionLabel={t('searchMusic')}
          message={t('emptyLibrary')}
          onAction={navigateToSearch}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg-deep"
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      <HomeHeader title={t('title')} />

      {playlists.length > 0 && (
        <>
          <SectionLabel label={t('playlists')} />
          <PlaylistCardList playlists={playlists} onPress={navigateToPlaylist} />
        </>
      )}

      {recentlyAdded.length > 0 && (
        <>
          <SectionLabel label={t('recentlyAdded')} />
          <TrackCardList
            tracks={recentlyAdded}
            onPress={handleTrackPress}
            unknownTitle={tc('unknown_title')}
            unknownArtist={tc('unknown_artist')}
          />
        </>
      )}

      {recentlyPlayed.length > 0 && (
        <>
          <SectionLabel label={t('recentlyPlayed')} />
          <TrackCardList
            tracks={recentlyPlayed}
            onPress={handleTrackPress}
            unknownTitle={tc('unknown_title')}
            unknownArtist={tc('unknown_artist')}
          />
        </>
      )}

      {mostPlayed.length > 0 && (
        <>
          <SectionLabel label={t('mostPlayed')} />
          <TrackCardList
            tracks={mostPlayed}
            onPress={handleTrackPress}
            unknownTitle={tc('unknown_title')}
            unknownArtist={tc('unknown_artist')}
          />
        </>
      )}
    </ScrollView>
  );
}
