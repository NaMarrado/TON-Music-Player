import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListeningProfileSummary, ProfileCategoryStat, ProfileDetailedHistory, ProfileTrackStat, Track } from '@ton/core';
import { playTracks } from '../../audio/playback-service';
import { VirtualizedList } from '../../components/player/virtualized-list';
import { showToast } from '../../stores/toast-store';
import { VolumeDistribution } from './profile-charts';
import { useProfileFormat } from './profile-format';
import { DetailFields, SessionDetail } from './profile-session-detail';
import { ProfileSelect } from './profile-select';
import { ProfileTrackRow } from './profile-track-row';

type View = 'tracks' | 'artists' | 'albums' | 'genres' | 'favorites' | 'history';
type Sort = 'time' | 'plays' | 'recent';
type Selection = { identity: string; session: string | null; fromTrack: boolean };
const LIST_HEIGHT = 560;

const VIEWS: View[] = ['tracks', 'artists', 'albums', 'genres', 'favorites', 'history'];
const ROW_SIZE = 65;

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="profile-back" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {label}
    </button>
  );
}

function matches(query: string, ...values: (string | null | undefined)[]): boolean {
  return !query || values.some((value) => value?.toLowerCase().includes(query));
}

export function ProfileExplorer({ summary }: { summary: ListeningProfileSummary }) {
  const { t } = useTranslation('pages/profile');
  const format = useProfileFormat();
  const { analytics } = summary;
  const [view, setView] = useState<View>('tracks');
  const [sort, setSort] = useState<Sort>('time');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const query = useDeferredValue(search.trim().toLowerCase());

  const play = (tracks: Track[], track: Track | null) => {
    if (!track) return;
    const index = tracks.findIndex((candidate) => candidate.id === track.id);
    if (index < 0) return;
    void playTracks(tracks, index).catch(() => showToast(t('playFailed'), 'error'));
  };

  const trackStats = useMemo(() => {
    const list = analytics.tracks.filter((stat) => matches(query, stat.title, stat.artist, stat.album, stat.genre));
    return [...list].sort((a, b) => sort === 'plays' ? b.plays - a.plays || b.listened_ms - a.listened_ms
      : sort === 'recent' ? b.last_played_at - a.last_played_at
        : b.listened_ms - a.listened_ms || b.plays - a.plays);
  }, [analytics.tracks, query, sort]);

  const categories = view === 'artists' ? analytics.artists : view === 'albums' ? analytics.albums : analytics.genres;
  const categoryList = useMemo(() => {
    const list = categories.filter((item) => matches(query, item.name));
    return [...list].sort((a, b) => sort === 'plays' ? b.plays - a.plays || b.listened_ms - a.listened_ms : b.listened_ms - a.listened_ms || b.plays - a.plays);
  }, [categories, query, sort]);

  const statByTrackId = useMemo(() => {
    const map = new Map<number, ProfileTrackStat>();
    for (const stat of analytics.tracks) if (stat.track_id !== null) map.set(stat.track_id, stat);
    return map;
  }, [analytics.tracks]);

  const favorites = useMemo(() => summary.favorites.filter((track) => matches(query, track.title, track.artist, track.album, track.genre)), [summary.favorites, query]);
  const history = useMemo(() => {
    const list = analytics.history.filter((entry) => matches(query, entry.title, entry.artist, entry.album, entry.genre));
    return [...list].sort((a, b) => b.started_at - a.started_at);
  }, [analytics.history, query]);

  const playableTracks = useMemo(() => trackStats.flatMap((stat) => stat.track?.file_path ? [stat.track] : []), [trackStats]);
  const historyTracks = useMemo(() => history.flatMap((entry) => entry.track?.file_path ? [entry.track] : []), [history]);

  const selectedStat = selection ? analytics.tracks.find((stat) => stat.identity === selection.identity) ?? null : null;
  const selectedSession = selection?.session ? analytics.history.find((entry) => entry.session_id === selection.session) ?? null : null;

  const deviceName = (id: string) => analytics.devices.find((device) => device.device_id === id)?.name ?? id;
  const rowMetrics = (listened: number, plays: number) => <><span data-hint={t('hints.rowTime')}>{format.duration(listened)}</span><small data-hint={t('hints.rowPlays')}>{t('plays', { count: plays })}</small></>;

  const sortOptions: Sort[] = view === 'tracks' ? ['time', 'plays', 'recent'] : view === 'artists' || view === 'albums' || view === 'genres' ? ['time', 'plays'] : [];
  const effectiveSort = sortOptions.includes(sort) ? sort : 'time';

  const changeView = (next: View) => { setView(next); setSelection(null); };

  let body;
  if (selection && selectedSession) {
    body = (
      <div className="profile-detail-content">
        <BackButton
          label={t(selection.fromTrack ? 'backToTrack' : 'backToList')}
          onClick={() => setSelection(selection.fromTrack && selectedStat ? { ...selection, session: null } : null)}
        />
        <SessionDetail session={selectedSession} />
      </div>
    );
  } else if (selection && selectedStat) {
    const sessions = analytics.history.filter((entry) => entry.identity === selectedStat.identity).sort((a, b) => b.started_at - a.started_at);
    const title = selectedStat.title || selectedStat.track?.title || t('unknownTitle');
    body = (
      <div className="profile-detail-content">
        <BackButton label={t('backToList')} onClick={() => setSelection(null)} />
        <div className="profile-detail-heading"><span className="profile-eyebrow">{t('trackDetails')}</span><h3>{title}</h3><p>{selectedStat.artist || t('unknownArtist')}</p></div>
        {!selectedStat.track?.file_path && <p className="profile-note">{t('trackUnavailable')}</p>}
        <DetailFields fields={[
          { label: t('listeningTime'), value: format.exactDuration(selectedStat.listened_ms), hint: t('hints.listeningTime') },
          { label: t('totalPlays'), value: format.number(selectedStat.plays), hint: t('hints.totalPlays') },
          { label: t('completed'), value: format.number(selectedStat.completed), hint: t('hints.completed') },
          { label: t('skipped'), value: format.number(selectedStat.skipped), hint: t('hints.skipped') },
          { label: t('album'), value: selectedStat.album || t('unknownAlbum'), hint: t('hints.album') },
          { label: t('genre'), value: selectedStat.genre || t('unknownGenre'), hint: t('hints.genre') },
          { label: t('trackDuration'), value: selectedStat.duration_ms === null ? t('unknownValue') : format.exactDuration(selectedStat.duration_ms), hint: t('hints.trackDuration') },
          { label: t('firstPlayed'), value: format.dateTime(selectedStat.first_played_at), hint: t('hints.firstPlayed') },
          { label: t('lastPlayed'), value: format.dateTime(selectedStat.last_played_at), hint: t('hints.lastPlayed') },
          { label: t('deviceActivity'), value: selectedStat.device_ids.map(deviceName).join(', ') || t('unknownValue'), hint: t('hints.deviceActivity') },
        ]} />
        <VolumeDistribution volume={selectedStat.volume} />
        <section aria-label={t('sessions')}>
          <h3 className="profile-subheading" data-hint={t('hints.sessions')}>{t('sessions')} <span>{format.number(sessions.length)}</span></h3>
          {sessions.length === 0 ? <p className="profile-empty-inline">{t('noSessions')}</p> : sessions.map((entry) => (
            <button key={entry.session_id} type="button" className="profile-session-row" onClick={() => setSelection({ identity: selectedStat.identity, session: entry.session_id, fromTrack: true })}>
              <span>{format.dateTime(entry.started_at)}</span>
              <span>{deviceName(entry.device.device_id)}</span>
              <strong data-hint={t('hints.rowTime')}>{format.duration(entry.listened_ms)}</strong>
            </button>
          ))}
        </section>
      </div>
    );
  } else if (view === 'artists' || view === 'albums' || view === 'genres') {
    body = categoryList.length === 0 ? <p className="profile-empty-inline">{t(query ? 'noResults' : 'noObservations')}</p> : (
      <VirtualizedList
        className="profile-scroll-list"
        style={{ height: LIST_HEIGHT }}
        items={categoryList}
        estimateSize={56}
        keyExtractor={(item: ProfileCategoryStat) => item.name}
        renderItem={(item: ProfileCategoryStat, index) => <CategoryRow item={item} ordinal={index + 1} maximum={categoryList[0].listened_ms} />}
      />
    );
  } else if (view === 'favorites') {
    body = favorites.length === 0 ? <p className="profile-empty-inline">{t(query ? 'noResults' : 'noFavorites')}</p> : (
      <VirtualizedList
        className="profile-scroll-list"
        style={{ height: LIST_HEIGHT }}
        items={favorites}
        estimateSize={ROW_SIZE}
        keyExtractor={(track: Track) => track.id}
        renderItem={(track: Track) => {
          const stat = statByTrackId.get(track.id);
          return (
            <ProfileTrackRow
              track={track}
              title={track.title || t('unknownTitle')}
              artist={track.artist || t('unknownArtist')}
              metrics={<>{stat && <span data-hint={t('hints.rowTime')}>{format.duration(stat.listened_ms)}</span>}<small data-hint={t('hints.lifetimePlays')}>{t('lifetimePlays')}: {format.number(track.play_count)}</small></>}
              onPlay={() => play(favorites, track)}
              onInspect={stat ? () => setSelection({ identity: stat.identity, session: null, fromTrack: false }) : undefined}
            />
          );
        }}
      />
    );
  } else if (view === 'history') {
    body = history.length === 0 ? <p className="profile-empty-inline">{t(query ? 'noResults' : 'noHistory')}</p> : (
      <VirtualizedList
        className="profile-scroll-list"
        style={{ height: LIST_HEIGHT }}
        items={history}
        estimateSize={86}
        keyExtractor={(entry: ProfileDetailedHistory) => entry.session_id}
        renderItem={(entry: ProfileDetailedHistory) => (
          <ProfileTrackRow
            track={entry.track}
            title={entry.title || t('unknownTitle')}
            artist={entry.artist || t('unknownArtist')}
            detail={`${format.dateTime(entry.started_at)} · ${deviceName(entry.device.device_id)}`}
            metrics={<span data-hint={t('hints.rowTime')}>{format.duration(entry.listened_ms)}</span>}
            onPlay={() => play(historyTracks, entry.track)}
            onInspect={() => setSelection({ identity: entry.identity, session: entry.session_id, fromTrack: false })}
          />
        )}
      />
    );
  } else {
    body = trackStats.length === 0 ? <p className="profile-empty-inline">{t(query ? 'noResults' : 'noObservations')}</p> : (
      <VirtualizedList
        className="profile-scroll-list"
        style={{ height: LIST_HEIGHT }}
        items={trackStats}
        estimateSize={ROW_SIZE}
        keyExtractor={(stat: ProfileTrackStat) => stat.identity}
        renderItem={(stat: ProfileTrackStat, index) => (
          <ProfileTrackRow
            track={stat.track}
            ordinal={index + 1}
            title={stat.title || stat.track?.title || t('unknownTitle')}
            artist={stat.artist || stat.track?.artist || t('unknownArtist')}
            metrics={rowMetrics(stat.listened_ms, stat.plays)}
            onPlay={() => play(playableTracks, stat.track)}
            onInspect={() => setSelection({ identity: stat.identity, session: null, fromTrack: false })}
          />
        )}
      />
    );
  }

  return (
    <section className="profile-panel" aria-label={t('explore')}>
      <div className="profile-tabs" role="group" aria-label={t('explore')}>
        {VIEWS.map((entry) => (
          <button key={entry} type="button" aria-pressed={view === entry} onClick={() => changeView(entry)} data-hint={t(`hints.views.${entry}`)}>{t(`views.${entry}`)}</button>
        ))}
      </div>
      {!(selection && (selectedSession || selectedStat)) && (
        <div className="profile-explorer-tools">
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} aria-label={t('search')} data-hint={t('hints.search')} />
          {sortOptions.length > 1 && (
            <ProfileSelect
              value={effectiveSort}
              options={sortOptions.map((option) => ({ value: option, label: t(`sorts.${option}`) }))}
              onChange={(value) => setSort(value as Sort)}
              label={t('sort')}
              hint={t('hints.sort')}
            />
          )}
        </div>
      )}
      <div className="profile-explorer-body">{body}</div>
    </section>
  );
}

function CategoryRow({ item, ordinal, maximum }: { item: ProfileCategoryStat; ordinal: number; maximum: number }) {
  const { t } = useTranslation('pages/profile');
  const format = useProfileFormat();
  return (
    <div className="profile-category-row">
      <span className="profile-rank" aria-hidden="true">{ordinal}</span>
      <div className="profile-category-main">
        <strong title={item.name}>{item.name}</strong>
        <div className="profile-meter" aria-hidden="true"><span style={{ width: `${maximum > 0 ? item.listened_ms / maximum * 100 : 0}%` }} /></div>
      </div>
      <div className="profile-track-metrics"><span data-hint={t('hints.rowTime')}>{format.duration(item.listened_ms)}</span><small data-hint={t('hints.rowPlays')}>{t('plays', { count: item.plays })}</small></div>
    </div>
  );
}
