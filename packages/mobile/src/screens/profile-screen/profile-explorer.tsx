import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ProfileAnalytics, ProfileCategoryStat, ProfileTrackStat, Track } from '@ton/core';
import { CoverImage } from '../../components/cover-image';
import { SearchInput } from '../../components/search-input';
import { playTracks } from '../../services/playback-bridge';
import { showToast } from '../../stores/toast-store';
import { useProfileFormat } from './profile-format';
import { Chips, Muted } from './profile-parts';

type ExplorerView = 'tracks' | 'artists' | 'albums' | 'genres' | 'favorites' | 'history';
type Sort = 'time' | 'plays' | 'recent';
const VIEWS: ExplorerView[] = ['tracks', 'artists', 'albums', 'genres', 'favorites', 'history'];
/** Rows rendered per "Show more" step; the screen is one scroll view, so lists grow on request. */
const PAGE = 50;

export type ProfileSelection = { identity: string; session: string | null; fromTrack: boolean };

function matches(query: string, ...values: (string | null | undefined)[]): boolean {
  return !query || values.some((value) => value?.toLowerCase().includes(query));
}

function Row({ track, title, artist, ordinal, detail, metrics, onPlay, onInspect }: {
  track: Track | null;
  title: string;
  artist: string;
  ordinal?: number;
  detail?: string;
  metrics: ReactNode;
  onPlay: () => void;
  onInspect?: () => void;
}) {
  const { t } = useTranslation('profile');
  return (
    <View className="flex-row items-center px-4" style={{ minHeight: 60, gap: 10 }}>
      {ordinal !== undefined && <Text className="text-text-muted text-[12px] text-right" style={{ width: 22 }}>{ordinal}</Text>}
      <Pressable onPress={onPlay} disabled={!track?.file_path} accessibilityLabel={t('playTrack', { title })} style={{ opacity: track?.file_path ? 1 : 0.4 }}>
        <CoverImage uri={track?.cover_art_path ?? null} size={42} borderRadius={6} />
      </Pressable>
      <Pressable onPress={onInspect} disabled={!onInspect} className="flex-1 py-2 flex-row items-center" style={{ gap: 8 }}>
        <View className="flex-1">
          <Text className="text-white text-[13px] font-medium" numberOfLines={1}>{title}</Text>
          <Text className="text-text-secondary text-xs" numberOfLines={1}>{artist}</Text>
          {detail && <Text className="text-text-muted text-[11px]" numberOfLines={1}>{detail}</Text>}
        </View>
        <View className="items-end">{metrics}</View>
        {onInspect && <Feather name="chevron-right" size={16} color="#666" />}
      </Pressable>
    </View>
  );
}

function CategoryRow({ item, ordinal, maximum }: { item: ProfileCategoryStat; ordinal: number; maximum: number }) {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  return (
    <View className="flex-row items-center px-4 py-2" style={{ gap: 10 }}>
      <Text className="text-text-muted text-[12px] text-right" style={{ width: 22 }}>{ordinal}</Text>
      <View className="flex-1">
        <Text className="text-white text-[13px] font-medium" numberOfLines={1}>{item.name}</Text>
        <View className="h-1 mt-1.5 rounded-full bg-white/10">
          <View className="h-1 rounded-full bg-white/60" style={{ width: `${maximum > 0 ? item.listened_ms / maximum * 100 : 0}%` }} />
        </View>
      </View>
      <View className="items-end">
        <Text className="text-white text-[13px]">{format.duration(item.listened_ms)}</Text>
        <Text className="text-text-secondary text-[11px]">{t('plays', { count: item.plays })}</Text>
      </View>
    </View>
  );
}

export function ProfileExplorer({ analytics, favorites, onInspect }: {
  analytics: ProfileAnalytics;
  favorites: Track[];
  onInspect: (selection: ProfileSelection) => void;
}) {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  const [view, setView] = useState<ExplorerView>('tracks');
  const [sort, setSort] = useState<Sort>('time');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const query = useDeferredValue(search.trim().toLowerCase());

  const play = (tracks: Track[], track: Track | null) => {
    const index = track ? tracks.findIndex((candidate) => candidate.id === track.id) : -1;
    if (index >= 0) void playTracks(tracks, index).catch(() => showToast(t('playFailed'), 'error'));
  };

  const sortOptions: Sort[] = view === 'tracks' ? ['time', 'plays', 'recent'] : view === 'artists' || view === 'albums' || view === 'genres' ? ['time', 'plays'] : [];
  const effectiveSort = sortOptions.includes(sort) ? sort : 'time';

  const trackStats = useMemo(() => analytics.tracks
    .filter((stat) => matches(query, stat.title, stat.artist, stat.album, stat.genre))
    .sort((a, b) => effectiveSort === 'plays' ? b.plays - a.plays || b.listened_ms - a.listened_ms
      : effectiveSort === 'recent' ? b.last_played_at - a.last_played_at
        : b.listened_ms - a.listened_ms || b.plays - a.plays), [analytics.tracks, query, effectiveSort]);
  const categories = view === 'artists' ? analytics.artists : view === 'albums' ? analytics.albums : analytics.genres;
  const categoryList = useMemo(() => categories
    .filter((item) => matches(query, item.name))
    .sort((a, b) => effectiveSort === 'plays' ? b.plays - a.plays || b.listened_ms - a.listened_ms : b.listened_ms - a.listened_ms || b.plays - a.plays),
  [categories, query, effectiveSort]);
  const statByTrackId = useMemo(() => new Map(analytics.tracks.flatMap((stat) => stat.track_id === null ? [] : [[stat.track_id, stat] as const])), [analytics.tracks]);
  const favoriteList = useMemo(() => favorites.filter((track) => matches(query, track.title, track.artist, track.album, track.genre)), [favorites, query]);
  const history = useMemo(() => analytics.history
    .filter((entry) => matches(query, entry.title, entry.artist, entry.album, entry.genre))
    .sort((a, b) => b.started_at - a.started_at), [analytics.history, query]);
  const playableTracks = useMemo(() => trackStats.flatMap((stat) => stat.track?.file_path ? [stat.track] : []), [trackStats]);
  const historyTracks = useMemo(() => history.flatMap((entry) => entry.track?.file_path ? [entry.track] : []), [history]);
  const deviceName = (id: string) => analytics.devices.find((device) => device.device_id === id)?.name ?? id;
  const metrics = (listened: number, plays: number) => (
    <>
      <Text className="text-white text-[13px]">{format.duration(listened)}</Text>
      <Text className="text-text-secondary text-[11px]">{t('plays', { count: plays })}</Text>
    </>
  );

  let total: number;
  let rows: ReactNode;
  let empty: string;
  if (view === 'artists' || view === 'albums' || view === 'genres') {
    total = categoryList.length;
    empty = query ? 'noResults' : 'noObservations';
    rows = categoryList.slice(0, limit).map((item, index) => (
      <CategoryRow key={item.name} item={item} ordinal={index + 1} maximum={categoryList[0].listened_ms} />
    ));
  } else if (view === 'favorites') {
    total = favoriteList.length;
    empty = query ? 'noResults' : 'noFavorites';
    rows = favoriteList.slice(0, limit).map((track) => {
      const stat = statByTrackId.get(track.id);
      return (
        <Row
          key={track.id}
          track={track}
          title={track.title || t('unknownTitle')}
          artist={track.artist || t('unknownArtist')}
          metrics={<>
            {stat && <Text className="text-white text-[13px]">{format.duration(stat.listened_ms)}</Text>}
            <Text className="text-text-secondary text-[11px]">{t('lifetimePlays')}: {format.number(track.play_count)}</Text>
          </>}
          onPlay={() => play(favoriteList, track)}
          onInspect={stat ? () => onInspect({ identity: stat.identity, session: null, fromTrack: false }) : undefined}
        />
      );
    });
  } else if (view === 'history') {
    total = history.length;
    empty = query ? 'noResults' : 'noHistory';
    rows = history.slice(0, limit).map((entry) => (
      <Row
        key={entry.session_id}
        track={entry.track}
        title={entry.title || t('unknownTitle')}
        artist={entry.artist || t('unknownArtist')}
        detail={`${format.dateTime(entry.started_at)} · ${deviceName(entry.device.device_id)}`}
        metrics={<Text className="text-white text-[13px]">{format.duration(entry.listened_ms)}</Text>}
        onPlay={() => play(historyTracks, entry.track)}
        onInspect={() => onInspect({ identity: entry.identity, session: entry.session_id, fromTrack: false })}
      />
    ));
  } else {
    total = trackStats.length;
    empty = query ? 'noResults' : 'noObservations';
    rows = trackStats.slice(0, limit).map((stat: ProfileTrackStat, index) => (
      <Row
        key={stat.identity}
        track={stat.track}
        ordinal={index + 1}
        title={stat.title || stat.track?.title || t('unknownTitle')}
        artist={stat.artist || stat.track?.artist || t('unknownArtist')}
        metrics={metrics(stat.listened_ms, stat.plays)}
        onPlay={() => play(playableTracks, stat.track)}
        onInspect={() => onInspect({ identity: stat.identity, session: null, fromTrack: false })}
      />
    ));
  }

  return (
    <View className="mt-6">
      <Text className="text-white text-[17px] font-bold px-4 mb-3">{t('explore')}</Text>
      <Chips
        options={VIEWS.map((entry) => ({ value: entry, label: t(`views.${entry}`) }))}
        value={view}
        onChange={(next) => { setView(next); setLimit(PAGE); }}
      />
      <View className="mt-3">
        <SearchInput value={search} onChangeText={(text) => { setSearch(text); setLimit(PAGE); }} placeholder={t('search')} />
      </View>
      {sortOptions.length > 1 && (
        <View className="mt-3">
          <Chips
            options={sortOptions.map((option) => ({ value: option, label: t(`sorts.${option}`) }))}
            value={effectiveSort}
            onChange={setSort}
          />
        </View>
      )}
      <View className="mt-2">
        {total === 0 ? <View className="px-4 py-4"><Muted>{t(empty)}</Muted></View> : rows}
        {total > limit && (
          <Pressable onPress={() => setLimit(limit + PAGE)} className="mx-4 mt-2 py-2.5 rounded-full bg-bg-surface items-center">
            <Text className="text-white text-[13px] font-semibold">{t('showMore', { count: total - limit })}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
