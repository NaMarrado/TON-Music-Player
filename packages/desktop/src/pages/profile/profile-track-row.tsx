import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PROTOCOL, type Track } from '@ton/core';
import { NoCoverArt } from '../../components/ui/no-cover-art';
import { usePlaybackStore } from '../../stores/playback-store';

export function ProfileTrackRow({ track, title, artist, ordinal, detail, metrics, onPlay, onInspect }: {
  track: Track | null;
  title: string;
  artist: string;
  ordinal?: number;
  detail?: string;
  metrics: ReactNode;
  onPlay: () => void;
  onInspect?: () => void;
}) {
  const { t } = useTranslation('pages/profile');
  const isCurrent = usePlaybackStore((state) => track !== null && state.currentTrack?.id === track.id && state.isPlaying);
  const coverUrl = track?.cover_art_path ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(track.cover_art_path)}` : null;
  return (
    <div className={`profile-track-row${isCurrent ? ' profile-track-current' : ''}`}>
      {ordinal !== undefined && <span className="profile-rank" aria-hidden="true">{ordinal}</span>}
      <button type="button" className="profile-cover" disabled={!track?.file_path} onClick={onPlay} aria-label={t('playTrack', { title })} title={!track?.file_path ? t('trackUnavailable') : t('playTrack', { title })}>
        {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <NoCoverArt iconSize={18} />}
        <span className="profile-play-overlay" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l14-8z" /></svg></span>
      </button>
      {onInspect ? (
        <button type="button" onClick={onInspect} className="profile-track-info" aria-label={t('detailsFor', { title })}>
          <strong title={title}>{title}</strong>
          <span title={artist}>{artist}</span>
          {detail && <small title={detail}>{detail}</small>}
        </button>
      ) : (
        <div className="profile-track-info">
          <strong title={title}>{title}</strong>
          <span title={artist}>{artist}</span>
          {detail && <small title={detail}>{detail}</small>}
        </div>
      )}
      <div className="profile-track-metrics">{metrics}</div>
      {onInspect && (
        <button type="button" className="profile-icon-button" onClick={onInspect} aria-label={t('detailsFor', { title })} title={t('details')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}
