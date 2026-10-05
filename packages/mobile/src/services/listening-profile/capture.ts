import {
  ProfilePlaybackTracker, type PlaybackObservationKind, type ProfileDevice, type ProfilePlaybackSettings,
} from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import {
  addPlaybackRuntimeEventListener,
  getActivePlaybackTrack,
  getPlaybackPosition,
  getPlaybackState,
  PlaybackEvent,
  PlaybackStateValue,
  type PlaybackRuntimeTrack,
} from '../playback-runtime';
import { getMobileProfileDevice, recordMobileProfileSnapshot } from './store';

const TICK_MS = 1_000;
const CHECKPOINT_MS = 5_000;
/** Media position may differ from wall time by this much before it is called a seek. */
const SEEK_TOLERANCE_S = 2.5;
/** A track left within this distance of its end counts as finished, not skipped. */
const END_TOLERANCE_S = 2.5;

type ActiveSession = {
  tracker: ProfilePlaybackTracker;
  duration: number;
  lastPosition: number;
  lastTickAt: number;
  lastCheckpoint: number;
  lastQueuedMs: number;
  lastQueuedEvents: number;
  paused: boolean;
};

let started = false;
let active: ActiveSession | null = null;
let device: ProfileDevice | null = null;
let playing = false;
let generation = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let ticking: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function settings(): ProfilePlaybackSettings {
  const state = usePlaybackStore.getState();
  return {
    volume_percent: state.volumePercent,
    // The OS mixer is not observable here; unknown is never equated to app volume.
    system_volume_percent: null,
    muted: state.isMuted,
    playback_rate: 1,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
}

/** Queue item ids carry the local track id; a runtime item of a replaced queue falls back to its id prefix. */
function resolveTrackId(track: PlaybackRuntimeTrack | null | undefined, index?: number): number | null {
  const items = useQueueStore.getState().items;
  const itemId = track?.id == null ? '' : String(track.id);
  const item = itemId ? items.find((entry) => entry.id === itemId) : index != null ? items[index] : undefined;
  if (item) return item.track_id;
  const parsed = Number.parseInt(itemId.split('-')[0], 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function persist(session: ActiveSession): void {
  const snapshot = session.tracker.checkpoint();
  const events = snapshot.observations?.length ?? 0;
  if (!snapshot.listened_ms || (snapshot.listened_ms === session.lastQueuedMs && events === session.lastQueuedEvents
    && snapshot.ended_at === null)) return;
  session.lastQueuedMs = snapshot.listened_ms;
  session.lastQueuedEvents = events;
  writeChain = writeChain.catch(() => {}).then(async () => { await recordMobileProfileSnapshot(snapshot); });
  void writeChain.catch((error) => {
    session.lastQueuedMs = -1;
    console.warn('[Profile] Could not persist measured listening time.', error);
  });
}

async function readPosition(): Promise<number | null> {
  try {
    const position = await getPlaybackPosition();
    return Number.isFinite(position) ? position : null;
  } catch {
    return null;
  }
}

async function sample(): Promise<void> {
  const session = active;
  if (!session) return;
  const position = await readPosition();
  if (position == null || session !== active) return;
  const now = performance.now();
  const elapsed = (now - session.lastTickAt) / 1000;
  const expected = session.lastPosition + (playing ? elapsed : 0);
  if (Math.abs(position - expected) > SEEK_TOLERANCE_S && session.lastTickAt > 0) {
    session.tracker.discontinuity();
    session.tracker.observe('seek', Date.now(), position, settings(), session.lastPosition);
  }
  session.tracker.sample(now, Date.now(), position, playing, settings());
  session.lastPosition = position;
  session.lastTickAt = now;
  if (now - session.lastCheckpoint >= CHECKPOINT_MS) {
    session.lastCheckpoint = now;
    persist(session);
  }
}

function tick(): Promise<void> {
  ticking ??= sample().finally(() => { ticking = null; });
  return ticking;
}

async function observe(...kinds: PlaybackObservationKind[]): Promise<void> {
  await tick();
  const session = active;
  if (!session) return;
  for (const kind of kinds) session.tracker.observe(kind, Date.now(), session.lastPosition, settings());
}

/**
 * `resample: false` is for the active-track-changed event: the player already
 * reports the next item's position, so sampling now would invent a seek and
 * hide that the previous track played to its end.
 */
async function finish(completed?: boolean, resample = true): Promise<void> {
  const session = active;
  if (!session) return;
  if (resample) await tick();
  if (session !== active) return;
  active = null;
  clearInterval(timer);
  timer = undefined;
  const finished = completed ?? (session.duration > 0 && session.lastPosition >= session.duration - END_TOLERANCE_S);
  const snapshot = session.tracker.snapshot;
  if (snapshot.listened_ms > 0) {
    session.tracker.observe(finished ? 'ended' : 'skip', Date.now(), session.lastPosition, settings());
  }
  snapshot.completed = finished;
  snapshot.ended_at = Math.max(snapshot.started_at, Date.now());
  const final = session.tracker.checkpoint();
  if (final.listened_ms > 0) {
    writeChain = writeChain.catch(() => {}).then(async () => { await recordMobileProfileSnapshot(final); });
    await writeChain.catch((error) => console.warn('[Profile] Could not persist measured listening time.', error));
  }
}

async function begin(trackId: number, durationSeconds: number): Promise<void> {
  const token = ++generation;
  await finish(undefined, false);
  device ??= await getMobileProfileDevice();
  if (token !== generation) return;
  const now = performance.now();
  active = {
    tracker: new ProfilePlaybackTracker({
      session_id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
      track_id: trackId, started_at: Date.now(), listened_ms: 0, completed: false, ended_at: null,
    }, device),
    duration: durationSeconds, lastPosition: 0, lastTickAt: 0, lastCheckpoint: now,
    lastQueuedMs: 0, lastQueuedEvents: 0, paused: false,
  };
  timer ??= setInterval(() => { void tick(); }, TICK_MS);
  await tick();
}

function trackChanged(track: PlaybackRuntimeTrack | null | undefined, index?: number): Promise<void> {
  const trackId = resolveTrackId(track, index);
  if (trackId == null) return finish(undefined, false);
  return begin(trackId, typeof track?.duration === 'number' ? track.duration : 0);
}

/**
 * Observes the real player (not UI state) so screen-off and car playback are
 * captured. Safe to call repeatedly; only one observer is installed per JS runtime.
 */
export function startMobileListeningCapture(): void {
  if (started) return;
  started = true;
  addPlaybackRuntimeEventListener(PlaybackEvent.PlaybackActiveTrackChanged, ({ track, index }) => {
    void trackChanged(track, index).catch(reportFailure);
  });
  addPlaybackRuntimeEventListener(PlaybackEvent.PlaybackState, ({ state }) => {
    void (async () => {
      const wasPlaying = playing;
      if (state === PlaybackStateValue.Ended) { playing = false; await finish(true); return; }
      if (state === PlaybackStateValue.Stopped || state === PlaybackStateValue.None) { playing = false; await finish(); return; }
      if (state === PlaybackStateValue.Playing) {
        await tick();
        playing = true;
        const session = active;
        if (session?.paused) { session.paused = false; await observe('resume'); }
      } else if (state === PlaybackStateValue.Paused || state === PlaybackStateValue.Ready) {
        await tick();
        playing = false;
        const session = active;
        if (session && wasPlaying && !session.paused && session.tracker.snapshot.listened_ms > 0) {
          session.paused = true;
          await observe('pause');
          persist(session);
        }
      } else {
        await tick();
        playing = false;
      }
    })().catch(reportFailure);
  });
  addPlaybackRuntimeEventListener(PlaybackEvent.PlaybackQueueEnded, () => {
    playing = false;
    void finish(true).catch(reportFailure);
  });
  for (const event of [PlaybackEvent.PlaybackError, PlaybackEvent.PlayerError] as const) {
    addPlaybackRuntimeEventListener(event, () => { void observe('error').catch(reportFailure); });
  }
  usePlaybackStore.subscribe((state, previous) => {
    if (!active) return;
    const kinds: PlaybackObservationKind[] = [];
    if (state.volumePercent !== previous.volumePercent || state.isMuted !== previous.isMuted) kinds.push('volume');
    if (state.shuffle !== previous.shuffle) kinds.push('shuffle');
    if (state.repeat !== previous.repeat) kinds.push('repeat');
    if (kinds.length) void observe(...kinds).catch(reportFailure);
  });
  void bootstrap().catch(reportFailure);
}

/** The service can start while the player is already running (app was swiped away). */
async function bootstrap(): Promise<void> {
  const [state, track] = await Promise.all([getPlaybackState(), getActivePlaybackTrack()]);
  if (!track || state.state === PlaybackStateValue.None || state.state === PlaybackStateValue.Stopped) return;
  playing = state.state === PlaybackStateValue.Playing;
  await trackChanged(track);
}

function reportFailure(error: unknown): void {
  console.warn('[Profile] Listening capture failed.', error);
}

/** Flush the open session before the process is torn down. */
export async function flushMobileListeningCapture(): Promise<void> {
  await tick();
  if (active) persist(active);
  await writeChain.catch(() => {});
}
