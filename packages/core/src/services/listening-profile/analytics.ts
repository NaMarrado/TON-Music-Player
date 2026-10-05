import type { ProfileAnalytics, ProfileCategoryStat, ProfileQuery, ProfileTimeBucket, ProfileTotals, ProfileTrackStat, ProfileVolumeStat } from '../../types/profile';
import type { Track } from '../../types/track';
import { profileTrackIdentity, type ProfileSessionRecord } from './records';

export function profileDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function profileQueryBounds(query: ProfileQuery, now: number, earliest: number): { from: number; to: number; previousFrom: number } {
  if (!['week', 'month', 'year', 'all'].includes(query.period)
    || (query.year != null && (!Number.isInteger(query.year) || query.year < 1970 || query.year > new Date(now).getFullYear()))) throw new Error('Invalid profile query');
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  let previousFrom: number;
  if (query.period === 'year') {
    const year = query.year ?? new Date(now).getFullYear();
    start.setFullYear(year, 0, 1); start.setHours(0, 0, 0, 0);
    end.setFullYear(year + 1, 0, 1); end.setHours(0, 0, 0, 0);
    previousFrom = new Date(year - 1, 0, 1).getTime();
  } else if (query.period === 'all') {
    start.setTime(earliest || now); start.setHours(0, 0, 0, 0);
    previousFrom = start.getTime();
  } else {
    const days = query.period === 'week' ? 7 : 30;
    start.setDate(start.getDate() - days);
    const previous = new Date(start); previous.setDate(previous.getDate() - days);
    previousFrom = previous.getTime();
  }
  return { from: start.getTime(), to: end.getTime(), previousFrom };
}

/** Difference of cumulative rounded fractions preserves exact totals at every boundary. */
function portion(start: number, end: number, measured: number, from: number, to: number): number {
  const left = Math.max(start, from), right = Math.min(end, to);
  if (right <= left || end <= start) return 0;
  return Math.round(measured * (right - start) / (end - start)) - Math.round(measured * (left - start) / (end - start));
}

export function buildProfileAnalytics(records: ProfileSessionRecord[], tracks: Track[], localDeviceId: string, query: ProfileQuery = { period: 'month' }, now = Date.now()): ProfileAnalytics {
  const earliest = records.reduce((min, record) => Math.min(min, record.started_at), now);
  const { from, to, previousFrom } = profileQueryBounds(query, now, earliest);
  const totals: ProfileTotals = { listened_ms: 0, plays: 0, completed: 0, skipped: 0, unique_tracks: 0, unique_artists: 0, active_days: 0, average_session_ms: 0, longest_session_ms: 0, pauses: 0, resumes: 0, seeks: 0, repeat_plays: 0 };
  const days = new Map<string, { date: string; listened_ms: number; plays: number }>();
  const hours: ProfileTimeBucket[] = Array.from({ length: 24 }, (_, index) => ({ index, listened_ms: 0, plays: 0 }));
  const weekdays: ProfileTimeBucket[] = Array.from({ length: 7 }, (_, index) => ({ index, listened_ms: 0, plays: 0 }));
  const ranking = new Map<string, ProfileTrackStat>();
  const volume = new Map<string, ProfileVolumeStat>();
  const devices = new Map(records.map((record) => [record.device.device_id, record.device]));
  const playableByIdentity = new Map(tracks.map((track) => [profileTrackIdentity(track, localDeviceId), track]));
  const playableById = new Map(tracks.map((track) => [track.id, track]));
  const history: ProfileAnalytics['history'] = [];
  const years = new Set<number>();
  let unlocated = 0, previousListened = 0, sessions = 0;
  const activeDays = new Set<string>();
  // Empty dates are meaningful for the chart, but all-time history is bounded by observed years.
  for (const date = new Date(from); date.getTime() < to; date.setDate(date.getDate() + 1)) {
    const key = profileDateKey(date.getTime()); days.set(key, { date: key, listened_ms: 0, plays: 0 });
  }
  for (const record of records) {
    years.add(new Date(record.started_at).getFullYear());
    for (const interval of record.intervals) years.add(new Date(interval.ended_at).getFullYear());
    if (query.device_id && record.device.device_id !== query.device_id) continue;
    const known = record.intervals.reduce((sum, interval) => sum + interval.listened_ms, 0);
    const unknown = Math.max(0, record.listened_ms - known);
    const startsHere = record.started_at >= from && record.started_at < to;
    let measured = startsHere ? unknown : 0;
    if (query.period !== 'all' && record.started_at >= previousFrom && record.started_at < from) previousListened += unknown;
    const trackVolume = new Map<string, ProfileVolumeStat>();
    if (startsHere && unknown) {
      unlocated += unknown;
      addVolume(volume, null, false, unknown); addVolume(trackVolume, null, false, unknown);
    }
    for (const interval of record.intervals) {
      const amount = portion(interval.started_at, interval.ended_at, interval.listened_ms, from, to);
      measured += amount;
      if (query.period !== 'all') previousListened += portion(interval.started_at, interval.ended_at, interval.listened_ms, previousFrom, from);
      if (!amount) continue;
      addVolume(volume, interval.volume_percent, interval.muted, amount);
      addVolume(trackVolume, interval.volume_percent, interval.muted, amount);
      let cursor = Math.max(from, interval.started_at);
      const limit = Math.min(to, interval.ended_at);
      while (cursor < limit) {
        const date = new Date(cursor);
        const nextHour = new Date(cursor); nextHour.setMinutes(0, 0, 0);
        // Add elapsed hour, not setHours(+1): repeated DST hours must both count.
        const boundary = Math.min(limit, nextHour.getTime() + 3_600_000);
        const end = boundary > cursor ? boundary : Math.min(limit, cursor + 3_600_000);
        const piece = portion(interval.started_at, interval.ended_at, interval.listened_ms, cursor, end);
        const key = profileDateKey(cursor);
        const day = days.get(key) ?? { date: key, listened_ms: 0, plays: 0 };
        day.listened_ms += piece; days.set(key, day);
        hours[date.getHours()].listened_ms += piece;
        weekdays[date.getDay()].listened_ms += piece;
        if (piece) activeDays.add(key);
        cursor = end;
      }
    }
    const events = record.observations.filter((event) => event.at >= from && event.at < to);
    if (!measured && !startsHere && !events.length) continue;
    const localTrack = record.device.device_id === localDeviceId && record.track_id != null ? playableById.get(record.track_id) : undefined;
    const track = localTrack && profileTrackIdentity(localTrack, localDeviceId) === record.identity ? localTrack : playableByIdentity.get(record.identity) ?? null;
    history.push({ identity: record.identity, session_id: record.session_id, started_at: record.started_at,
      ended_at: record.ended_at, listened_ms: record.listened_ms, completed: record.completed,
      skipped: record.observations.some((event) => event.kind === 'skip'), title: record.title,
      artist: record.artist, album: record.album, genre: record.genre, track,
      observations: record.observations, intervals: record.intervals, device: record.device });
    const completed = record.completed && record.ended_at != null && record.ended_at >= from && record.ended_at < to ? 1 : 0;
    const skipped = events.filter((event) => event.kind === 'skip').length;
    totals.listened_ms += measured; totals.completed += completed; totals.skipped += skipped;
    totals.pauses += events.filter((event) => event.kind === 'pause').length;
    totals.resumes += events.filter((event) => event.kind === 'resume').length;
    totals.seeks += events.filter((event) => event.kind === 'seek').length;
    totals.repeat_plays += events.filter((event) => event.kind === 'play' && event.repeat === 'one').length;
    if (measured) { sessions += 1; totals.longest_session_ms = Math.max(totals.longest_session_ms, measured); }
    const plays = startsHere && record.listened_ms > 0 ? 1 : 0;
    if (plays) {
      totals.plays += 1;
      const date = new Date(record.started_at), key = profileDateKey(record.started_at);
      const day = days.get(key) ?? { date: key, listened_ms: 0, plays: 0 }; day.plays += 1; days.set(key, day);
      hours[date.getHours()].plays += 1; weekdays[date.getDay()].plays += 1;
      activeDays.add(key);
    }
    const row = ranking.get(record.identity) ?? { identity: record.identity, track_id: track?.id ?? null, track,
      title: record.title, artist: record.artist, album: record.album, genre: record.genre, duration_ms: record.duration_ms,
      listened_ms: 0, plays: 0, completed: 0, skipped: 0, first_played_at: record.started_at, last_played_at: record.started_at, volume: [], device_ids: [] };
    row.listened_ms += measured; row.plays += plays; row.completed += completed; row.skipped += skipped;
    row.first_played_at = Math.min(row.first_played_at, record.started_at); row.last_played_at = Math.max(row.last_played_at, record.started_at);
    if (!row.device_ids.includes(record.device.device_id)) row.device_ids.push(record.device.device_id);
    const combined = new Map(row.volume.map((entry) => [`${entry.volume_percent}:${entry.muted}`, { ...entry }]));
    for (const entry of trackVolume.values()) addVolume(combined, entry.volume_percent, entry.muted, entry.listened_ms);
    row.volume = [...combined.values()]; ranking.set(record.identity, row);
  }
  const ranked = [...ranking.values()].sort((a, b) => b.listened_ms - a.listened_ms || b.plays - a.plays || a.identity.localeCompare(b.identity));
  totals.unique_tracks = ranked.filter((track) => track.listened_ms > 0 || track.plays > 0).length;
  totals.unique_artists = new Set(ranked.filter((track) => track.listened_ms > 0 || track.plays > 0).map((track) => track.artist).filter(Boolean)).size;
  totals.active_days = activeDays.size;
  totals.average_session_ms = sessions ? Math.round(totals.listened_ms / sessions) : 0;
  return { period: query.period, from, to, available_years: [...years].sort((a, b) => b - a), observation_started_at: records.length ? earliest : 0,
    totals, unlocated_listened_ms: unlocated, previous_listened_ms: previousListened,
    change_percent: previousListened > 0 ? (totals.listened_ms - previousListened) / previousListened * 100 : null,
    timeline: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), hours, weekdays, tracks: ranked,
    artists: categories(ranked, 'artist'), albums: categories(ranked, 'album'), genres: categories(ranked, 'genre'),
    history: history.sort((a, b) => b.started_at - a.started_at), devices: [...devices.values()].sort((a, b) => a.name.localeCompare(b.name)),
    volume: [...volume.values()].sort((a, b) => (a.volume_percent ?? -1) - (b.volume_percent ?? -1)) };
}

function addVolume(target: Map<string, ProfileVolumeStat>, percent: number | null, muted: boolean, amount: number): void {
  const key = `${percent}:${muted}`;
  const entry = target.get(key) ?? { volume_percent: percent, muted, listened_ms: 0 };
  entry.listened_ms += amount; target.set(key, entry);
}
function categories(tracks: ProfileTrackStat[], field: 'artist' | 'album' | 'genre'): ProfileCategoryStat[] {
  const groups = new Map<string, ProfileCategoryStat>();
  for (const track of tracks) {
    const name = track[field];
    if (!name || (!track.listened_ms && !track.plays)) continue;
    const group = groups.get(name) ?? { name, listened_ms: 0, plays: 0, unique_tracks: 0 };
    group.listened_ms += track.listened_ms; group.plays += track.plays; group.unique_tracks += 1; groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.listened_ms - a.listened_ms || b.plays - a.plays || a.name.localeCompare(b.name));
}
