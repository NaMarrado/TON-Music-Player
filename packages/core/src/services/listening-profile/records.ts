import type { ListeningSessionSnapshot } from '../../types/history';
import type { ListeningInterval, PlaybackObservation, ProfileDevice } from '../../types/profile';
import type { Track } from '../../types/track';

export const PROFILE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profile_sessions (
  device_id TEXT NOT NULL, session_id TEXT NOT NULL, day TEXT NOT NULL,
  version INTEGER NOT NULL, record TEXT NOT NULL,
  PRIMARY KEY(device_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_sessions_day ON profile_sessions(device_id, day);
CREATE TABLE IF NOT EXISTS profile_sync_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export interface ProfileSessionRecord {
  device: ProfileDevice;
  session_id: string;
  track_id: number | null;
  identity: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  duration_ms: number | null;
  started_at: number;
  ended_at: number | null;
  listened_ms: number;
  completed: boolean;
  version: number;
  intervals: ListeningInterval[];
  observations: PlaybackObservation[];
}

export function profileTrackIdentity(track: Track, deviceId: string): string {
  if (track.content_hash_sha256) return `sha256:${track.content_hash_sha256}`;
  if (track.youtube_id) return `youtube:${track.youtube_id}`;
  if (track.spotify_id) return `spotify:${track.spotify_id}`;
  if (track.soundcloud_id) return `soundcloud:${track.soundcloud_id}`;
  if (track.file_hash) return `file:${track.file_hash}`;
  return `local:${deviceId}:${track.id}`;
}

export function createProfileRecord(snapshot: ListeningSessionSnapshot, track: Track, device: ProfileDevice): ProfileSessionRecord {
  return {
    device, session_id: snapshot.session_id, track_id: track.id,
    identity: profileTrackIdentity(track, device.device_id),
    title: track.title, artist: track.artist, album: track.album, genre: track.genre,
    duration_ms: track.duration_ms, started_at: snapshot.started_at, ended_at: null,
    listened_ms: 0, completed: false, version: 0, intervals: [], observations: [],
  };
}

export function profileRecordDay(record: Pick<ProfileSessionRecord, 'started_at'>): string {
  return new Date(record.started_at).toISOString().slice(0, 10);
}

export function validProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
const safeTime = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 8_640_000_000_000_000;
const finiteRange = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const repeats = new Set(['off', 'all', 'one']);
const kinds = new Set(['play', 'pause', 'resume', 'seek', 'skip', 'ended', 'error', 'rate', 'volume', 'shuffle', 'repeat']);
export function validateProfileObservation(event: PlaybackObservation, deviceId: string, sessionId?: string): void {
  if (!event || !validProfileId(event.event_id) || !validProfileId(event.session_id)
    || event.device_id !== deviceId || (sessionId != null && event.session_id !== sessionId)
    || !safeTime(event.at) || !safeTime(event.position_ms)
    || (event.previous_position_ms != null && !safeTime(event.previous_position_ms))
    || !Number.isSafeInteger(event.track_id) || event.track_id <= 0
    || !kinds.has(event.kind) || !finiteRange(event.playback_rate, 0.01, 16)
    || !finiteRange(event.volume_percent, 0, 1000) || typeof event.shuffle !== 'boolean'
    || !repeats.has(event.repeat)) throw new Error('Invalid profile observation');
}

export function validateProfileRecord(record: ProfileSessionRecord, deviceId: string): void {
  if (!record || !record.device || !validProfileId(deviceId) || record.device.device_id !== deviceId
    || !validProfileId(record.session_id) || !safeTime(record.started_at) || !safeTime(record.listened_ms)
    || !Number.isSafeInteger(record.version) || record.version < 0
    || typeof record.completed !== 'boolean'
    || (record.ended_at !== null && (!safeTime(record.ended_at) || record.ended_at < record.started_at))
    || typeof record.identity !== 'string' || record.identity.length > 1024
    || typeof record.device.name !== 'string' || record.device.name.length > 256
    || !['windows', 'macos', 'linux', 'android', 'ios', 'unknown'].includes(record.device.platform)
    || !Array.isArray(record.intervals) || !Array.isArray(record.observations)
    || record.intervals.length > 100_000 || record.observations.length > 100_000
    || [record.title, record.artist, record.album, record.genre].some((value) => value !== null && (typeof value !== 'string' || value.length > 8192))
    || (record.duration_ms !== null && !safeTime(record.duration_ms))) throw new Error('Invalid profile record');
  const ids = new Set<string>();
  let total = 0;
  let end = record.started_at;
  for (const interval of record.intervals) {
    if (!interval || !validProfileId(interval.interval_id) || ids.has(interval.interval_id)
      || interval.session_id !== record.session_id || interval.device_id !== deviceId
      || !safeTime(interval.started_at) || !safeTime(interval.ended_at)
      || interval.started_at < end || interval.ended_at <= interval.started_at
      || !safeTime(interval.listened_ms) || interval.listened_ms > interval.ended_at - interval.started_at
      || (interval.volume_percent !== null && !finiteRange(interval.volume_percent, 0, 1000))
      || (interval.system_volume_percent !== null && !finiteRange(interval.system_volume_percent, 0, 100))
      || typeof interval.muted !== 'boolean' || typeof interval.shuffle !== 'boolean'
      || !finiteRange(interval.playback_rate, 0.01, 16) || !repeats.has(interval.repeat)) throw new Error('Invalid profile interval');
    ids.add(interval.interval_id);
    total += interval.listened_ms;
    end = interval.ended_at;
  }
  if (total > record.listened_ms) throw new Error('Profile intervals exceed measured time');
  ids.clear();
  for (const event of record.observations) {
    validateProfileObservation(event, deviceId, record.session_id);
    if (ids.has(event.event_id)) throw new Error('Duplicate profile observation');
    ids.add(event.event_id);
  }
}

/** Cumulative checkpoints cannot regress, reopen a terminal session, or change identity. */
export function mergeProfileRecord(previous: ProfileSessionRecord | null, incoming: ProfileSessionRecord): ProfileSessionRecord {
  validateProfileRecord(incoming, incoming.device.device_id);
  if (!previous) return incoming;
  if (previous.session_id !== incoming.session_id || previous.device.device_id !== incoming.device.device_id
    || previous.identity !== incoming.identity || previous.started_at !== incoming.started_at) throw new Error('Profile identity cannot change');
  if (incoming.version <= previous.version || previous.ended_at !== null) return previous;
  if (incoming.listened_ms < previous.listened_ms) return previous;
  const intervals = new Map(incoming.intervals.map((interval) => [interval.interval_id, interval]));
  for (const old of previous.intervals) {
    const next = intervals.get(old.interval_id);
    if (!next || next.started_at !== old.started_at || next.ended_at < old.ended_at
      || next.listened_ms < old.listened_ms || next.volume_percent !== old.volume_percent
      || next.muted !== old.muted || next.playback_rate !== old.playback_rate
      || next.shuffle !== old.shuffle || next.repeat !== old.repeat
      || next.system_volume_percent !== old.system_volume_percent) throw new Error('Profile interval cannot regress or change settings');
  }
  const events = new Map(incoming.observations.map((event) => [event.event_id, event]));
  for (const old of previous.observations) {
    if (JSON.stringify(events.get(old.event_id)) !== JSON.stringify(old)) throw new Error('Profile observation is immutable');
  }
  return incoming;
}

export function updateProfileRecord(previous: ProfileSessionRecord, snapshot: ListeningSessionSnapshot): ProfileSessionRecord {
  if (previous.ended_at !== null || snapshot.listened_ms < previous.listened_ms) return previous;
  if (snapshot.track_id !== previous.track_id || snapshot.started_at !== previous.started_at) throw new Error('Listening session identity cannot change');
  const intervals = new Map(previous.intervals.map((value) => [value.interval_id, value]));
  for (const value of snapshot.intervals ?? []) intervals.set(value.interval_id, value);
  const events = new Map(previous.observations.map((value) => [value.event_id, value]));
  for (const value of snapshot.observations ?? []) {
    const old = events.get(value.event_id);
    if (old && JSON.stringify(old) !== JSON.stringify(value)) throw new Error('Profile observation is immutable');
    events.set(value.event_id, value);
  }
  const next = { ...previous, listened_ms: snapshot.listened_ms, completed: previous.completed || snapshot.completed,
    ended_at: snapshot.ended_at, version: previous.version + 1,
    intervals: [...intervals.values()].sort((a, b) => a.started_at - b.started_at),
    observations: [...events.values()].sort((a, b) => a.at - b.at || a.event_id.localeCompare(b.event_id)),
  };
  if (JSON.stringify({ ...next, version: previous.version }) === JSON.stringify(previous)) return previous;
  return mergeProfileRecord(previous, next);
}
