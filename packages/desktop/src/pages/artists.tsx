import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CUSTOM_PROTOCOL } from '@ton/core';
import { useLibraryStore, loadTracks, getArtists } from '../stores/library-store';
import { NoCoverArt } from '../components/ui/no-cover-art';
import { EmptyState } from '../components/ui/empty-state';

export function ArtistsPage() {
  const { t } = useTranslation('pages/artists');
  const navigate = useNavigate();
  const tracks = useLibraryStore((s) => s.tracks);
  const hasLoaded = useLibraryStore((s) => s.hasLoaded);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const isStale = useLibraryStore((s) => s.isStale);

  useEffect(() => {
    if ((!hasLoaded || isStale) && !isLoading) {
      void loadTracks();
    }
  }, [hasLoaded, isLoading, isStale]);

  const artists = useMemo(() => getArtists(tracks), [tracks]);

  return (
    <div className="flex flex-col flex-1 overflow-y-auto pb-[120px]">
      <div className="flex items-center justify-between px-8 pt-5 pb-4">
        <h1
          className="text-[1.7rem] font-bold tracking-tight"
          style={{ fontFamily: "'Syne', sans-serif", color: 'var(--white)' }}
        >
          {t('title')}
        </h1>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {t('count', { count: artists.length })}
        </span>
      </div>

      {artists.length === 0 ? (
        <EmptyState message={t('empty')} />
      ) : (
        <div
          className="px-8 grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '8px',
          }}
        >
          {artists.map((a) => (
            <ArtistCard
              key={a.artist}
              artist={a.artist}
              coverArtPath={a.cover_art_path}
              trackCount={a.trackCount}
              t={t}
              onClick={() => navigate(`/artist/${encodeURIComponent(a.artist)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistCard({
  artist,
  coverArtPath,
  trackCount,
  t,
  onClick,
}: {
  artist: string;
  coverArtPath: string | null;
  trackCount: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onClick: () => void;
}) {
  const coverUrl = coverArtPath
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(coverArtPath)}`
    : null;

  return (
    <div
      className="flex flex-col items-center cursor-pointer album-card"
      style={{ padding: '16px 12px', borderRadius: 'var(--radius-lg)', transition: 'all var(--transition)' }}
      onClick={onClick}
    >
      <div
        className="rounded-full overflow-hidden mb-3"
        style={{ width: '120px', height: '120px' }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt={artist} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <NoCoverArt iconSize={32} />
        )}
      </div>
      <div className="truncate font-medium text-center w-full" style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
        {artist}
      </div>
      <div className="truncate text-center w-full" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {t('trackCount', { count: trackCount })}
      </div>
    </div>
  );
}
