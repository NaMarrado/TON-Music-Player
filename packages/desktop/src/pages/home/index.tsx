import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { playTracks } from '../../audio/playback-service';
import { HorizontalScroll } from '../../components/ui/horizontal-scroll';
import { SectionLabel } from '../../components/ui/section-label';
import { HomeEmptyState } from './home-empty-state';
import { HomeHeader } from './home-header';
import { HomePlaylistCard } from './home-playlist-card';
import { HomeTrackCard } from './home-track-card';
import { useHomePageData } from './use-home-page-data';

export function HomePage() {
  const { t } = useTranslation('pages/home');
  const navigate = useNavigate();
  const {
    isEmpty,
    recentPlaylists,
    recentTracks,
    recentlyPlayed,
  } = useHomePageData();

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <HomeHeader title={t('title')} />

      {isEmpty && (
        <HomeEmptyState
          message={t('emptyLibrary')}
          buttonLabel={t('goToSearch')}
          onGoToSearch={() => navigate('/search')}
        />
      )}

      <div style={{ padding: '0 32px 120px' }}>
        {recentPlaylists.length > 0 && (
          <section className="animate-fade-in" style={{ marginTop: '20px' }}>
            <SectionLabel className="mb-3">{t('recentPlaylists')}</SectionLabel>
            <HorizontalScroll>
              {recentPlaylists.map((playlist) => (
                <HomePlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  onClick={() => navigate(`/playlist/${playlist.id}`)}
                />
              ))}
            </HorizontalScroll>
          </section>
        )}

        {recentTracks.length > 0 && (
          <section className="mt-4 animate-fade-in">
            <SectionLabel className="mb-3">{t('recentlyAdded')}</SectionLabel>
            <HorizontalScroll>
              {recentTracks.map((track) => (
                <HomeTrackCard
                  key={track.id}
                  track={track}
                  onPlay={() => playTracks(recentTracks, recentTracks.indexOf(track))}
                />
              ))}
            </HorizontalScroll>
          </section>
        )}

        {recentlyPlayed.length > 0 && (
          <section className="animate-fade-in" style={{ marginTop: '20px' }}>
            <SectionLabel className="mb-3">{t('recentlyPlayed')}</SectionLabel>
            <HorizontalScroll>
              {recentlyPlayed.map((track) => (
                <HomeTrackCard
                  key={track.id}
                  track={track}
                  onPlay={() => playTracks(recentlyPlayed, recentlyPlayed.indexOf(track))}
                />
              ))}
            </HorizontalScroll>
          </section>
        )}
      </div>
    </div>
  );
}
