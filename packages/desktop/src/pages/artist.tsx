import { useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { formatTime, CUSTOM_PROTOCOL } from '@ton/core';
import { playTracks } from '../audio/playback-service';
import { BackButton } from '../components/ui/back-button';
import { loadTracks, useLibraryStore } from '../stores/library-store';
import { usePlaybackStore } from '../stores/playback-store';

export function ArtistPage() {
  const { t } = useTranslation('pages/artist');
  const { id } = useParams();
  const artistName = id ? decodeURIComponent(id) : '';
  const allTracks = useLibraryStore((state) => state.tracks);
  const hasLoaded = useLibraryStore((state) => state.hasLoaded);
  const isLoading = useLibraryStore((state) => state.isLoading);
  const isStale = useLibraryStore((state) => state.isStale);

  useEffect(() => {
    if (!artistName) {
      return;
    }
    if ((!hasLoaded || isStale) && !isLoading) {
      void loadTracks().catch(() => {});
    }
  }, [artistName, hasLoaded, isLoading, isStale]);

  const tracks = useMemo(
    () => allTracks.filter((track) => track.artist === artistName || track.album_artist === artistName),
    [allTracks, artistName],
  );

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTracks(tracks, 0);
  }, [tracks]);

  const currentTrackId = usePlaybackStore((s) => s.currentTrack?.id);

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <BackButton label={t('back')} />

      {/* Artist header */}
      <div className="px-8 pt-4 pb-6">
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          {t('artistLabel')}
        </p>
        <h1
          className="text-[2rem] font-bold tracking-tight"
          style={{ fontFamily: "'Syne', sans-serif", color: 'var(--white)' }}
        >
          {artistName}
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {tracks.length} {t('tracks')}
        </p>
        <button
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full cursor-pointer"
          onClick={handlePlayAll}
          style={{
            background: 'var(--white)',
            color: 'var(--bg-deep)',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {t('playAll')}
        </button>
      </div>

      {/* Track list */}
      <div className="flex-1 px-8 pb-[120px]">
        {tracks.map((track, idx) => {
          const isPlaying = currentTrackId === track.id;
          const coverUrl = track.cover_art_path
            ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(track.cover_art_path)}`
            : null;

          return (
            <div
              key={track.id}
              className={`track-row flex items-center gap-3 cursor-pointer${isPlaying ? ' is-playing' : ''}`}
              onDoubleClick={() => playTracks(tracks, idx)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                transition: 'background var(--transition)',
              }}
            >
              {/* Thumbnail */}
              <div className="shrink-0 rounded overflow-hidden" style={{ width: '40px', height: '40px' }}>
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)' }}>
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Title */}
              <span
                className={`truncate flex-1${isPlaying ? ' track-title' : ''}`}
                style={{ fontSize: '0.88rem', color: isPlaying ? 'var(--white)' : 'var(--text-primary)' }}
              >
                {track.title || 'Unknown'}
              </span>

              {/* Duration */}
              <span
                className="shrink-0"
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTime(track.duration_ms)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
