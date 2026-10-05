import { ProfilePlaybackTracker, type ListeningSessionSnapshot, type PlaybackObservationKind, type ProfileDevice, type ProfilePlaybackSettings } from '@ton/core';
import { mergeLibraryTrackSummaries } from '../../stores/library-store';
import { usePlaybackStore } from '../../stores/playback-store';
import { getActiveElement, getPreloadElement } from '../media-element-pool';
import { flushDesktopPlaybackSession } from './session';

const CHECKPOINT_INTERVAL_MS = 5_000;

type ActiveSession = {
  base: ListeningSessionSnapshot;
  /** Created once the persistent device identity is known; time before that is not observable. */
  tracker: ProfilePlaybackTracker | null;
  counted: boolean;
  lastQueuedMs: number;
  lastQueuedEvents: number;
  lastQueuedEndedAt: number | null;
  lastCheckpoint: number;
  lastPosition: number;
  seekFrom: number | null;
  paused: boolean;
};

let initialized = false;
let active: ActiveSession | null = null;
let mediaPlaying = false;
let device: ProfileDevice | null = null;
let lastSettings: ProfilePlaybackSettings | null = null;
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

export function subscribeListeningProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initializeListeningTracking(): void {
  if (initialized) return;
  initialized = true;
  void window.api.invoke('profile:get-device').then((value) => { device = value; }).catch(reportListeningFailure);
  usePlaybackStore.subscribe((state, previous) => {
    if (!active) return;
    const kinds: PlaybackObservationKind[] = [];
    if (state.volumePercent !== previous.volumePercent || state.isMuted !== previous.isMuted) kinds.push('volume');
    if (state.shuffle !== previous.shuffle) kinds.push('shuffle');
    if (state.repeat !== previous.repeat) kinds.push('repeat');
    if (kinds.length) observeListening(...kinds);
  });
  for (const element of [getActiveElement(), getPreloadElement()]) {
    element.addEventListener('playing', () => {
      if (element !== getActiveElement()) return;
      mediaPlaying = true;
      sampleListening();
      if (active?.paused && active.tracker) { active.paused = false; observeListening('resume'); }
    });
    for (const name of ['pause', 'waiting', 'ended', 'error', 'emptied']) {
      element.addEventListener(name, () => {
        if (element !== getActiveElement()) return;
        mediaPlaying = false;
        sampleListening();
        if (name === 'pause' && active?.tracker && !element.ended && !active.paused) { active.paused = true; observeListening('pause'); }
        if (name === 'error') observeListening('error');
        void flushListening().catch(reportListeningFailure);
      });
    }
    element.addEventListener('stalled', () => {
      // A network stall can occur while buffered audio still plays. Progress,
      // not the download event, determines whether time is counted.
      if (element === getActiveElement()) sampleListening();
    });
    element.addEventListener('seeking', () => {
      if (element !== getActiveElement()) return;
      if (active) { active.seekFrom ??= active.lastPosition; active.tracker?.discontinuity(); }
      mediaPlaying = false;
      void flushListening().catch(reportListeningFailure);
    });
    element.addEventListener('seeked', () => {
      if (element !== getActiveElement()) return;
      mediaPlaying = !element.paused && !element.ended && element.readyState >= 2;
      if (active?.tracker) {
        observeListening('seek', active.seekFrom ?? undefined);
        active.seekFrom = null;
      }
      sampleListening();
    });
    element.addEventListener('ratechange', () => {
      if (element !== getActiveElement()) return;
      sampleListening();
      observeListening('rate');
    });
  }

  window.setInterval(() => {
    sampleListening();
    const session = active;
    if (!session?.tracker || session.tracker.snapshot.listened_ms === 0) return;
    const now = performance.now();
    if (session.lastQueuedMs === 0 || now - session.lastCheckpoint >= CHECKPOINT_INTERVAL_MS) {
      session.lastCheckpoint = now;
      persistListening(session);
    }
  }, 250);
  window.api.on('profile:flush-listening', (requestId: string) => {
    // Pause at the point of shutdown so the acknowledged flush is the final
    // audible sample, not a checkpoint followed by more unrecorded playback.
    sampleListening();
    getActiveElement().pause();
    mediaPlaying = false;
    void Promise.all([flushListening(), flushDesktopPlaybackSession()])
      .then(() => window.api.invoke('profile:flush-complete', requestId))
      .catch(reportListeningFailure);
  });
  window.addEventListener('beforeunload', () => {
    void flushListening().catch(reportListeningFailure);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushListening().catch(reportListeningFailure);
  });
}

/** Source loads do not count as plays: the first advancing audio sample does. */
export function beginListeningSession(trackId: number, completedPrevious = false): void {
  finishListeningSession(completedPrevious);
  mediaPlaying = false;
  active = {
    base: {
      session_id: crypto.randomUUID(),
      track_id: trackId,
      started_at: Date.now(),
      listened_ms: 0,
      completed: false,
      ended_at: null,
    },
    tracker: null,
    counted: false,
    lastQueuedMs: 0,
    lastQueuedEvents: 0,
    lastQueuedEndedAt: null,
    lastCheckpoint: performance.now(),
    lastPosition: 0,
    seekFrom: null,
    paused: false,
  };
}

export async function restoreListeningSession(trackId: number): Promise<void> {
  const snapshot = await window.api.invoke('profile:get-session', trackId);
  if (!snapshot) {
    beginListeningSession(trackId);
    return;
  }
  mediaPlaying = false;
  active = {
    base: snapshot,
    tracker: null,
    counted: snapshot.listened_ms > 0,
    lastQueuedMs: snapshot.listened_ms,
    lastQueuedEvents: snapshot.observations?.length ?? 0,
    lastQueuedEndedAt: null,
    lastCheckpoint: performance.now(),
    lastPosition: 0,
    seekFrom: null,
    paused: false,
  };
}

export function finishListeningSession(completed: boolean): void {
  const session = active;
  if (!session) return;
  sampleListening();
  const tracker = session.tracker;
  if (tracker && tracker.snapshot.listened_ms > 0) {
    tracker.observe(completed ? 'ended' : 'skip', Date.now(), session.lastPosition, currentSettings());
  }
  const snapshot = tracker?.snapshot ?? session.base;
  snapshot.completed = completed;
  snapshot.ended_at = Math.max(snapshot.started_at, Date.now());
  persistListening(session);
  active = null;
  mediaPlaying = false;
}

/** Capture progress before changing currentTime; seeking events occur afterward. */
export function prepareListeningSeek(): void {
  sampleListening();
  if (active) { active.seekFrom = active.lastPosition; active.tracker?.discontinuity(); }
  mediaPlaying = false;
  if (active) persistListening(active);
}

export async function flushListening(): Promise<void> {
  sampleListening();
  if (active) persistListening(active);
  await writeChain;
}

function currentSettings(): ProfilePlaybackSettings {
  const state = usePlaybackStore.getState();
  const settings: ProfilePlaybackSettings = {
    volume_percent: state.volumePercent,
    // The renderer cannot observe the OS mixer; unknown is never equated to app volume.
    system_volume_percent: null,
    muted: state.isMuted,
    playback_rate: getActiveElement().playbackRate,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
  lastSettings = settings;
  return settings;
}

function sampleListening(): void {
  const session = active;
  if (!session) return;
  if (!session.tracker && device) session.tracker = new ProfilePlaybackTracker(session.base, device);
  const element = getActiveElement();
  session.lastPosition = element.currentTime;
  session.tracker?.sample(
    performance.now(),
    Date.now(),
    element.currentTime,
    mediaPlaying && !element.paused && !element.ended && !element.seeking,
    currentSettings(),
  );
}

function observeListening(...kinds: PlaybackObservationKind[]): void;
function observeListening(kind: 'seek', previousPosition?: number): void;
function observeListening(...args: (PlaybackObservationKind | number | undefined)[]): void {
  const session = active;
  if (!session) return;
  sampleListening();
  const tracker = session.tracker;
  if (!tracker) return;
  const settings = lastSettings ?? currentSettings();
  const previous = typeof args[1] === 'number' ? args[1] : undefined;
  for (const kind of args) {
    if (typeof kind === 'string') tracker.observe(kind, Date.now(), session.lastPosition, settings, previous);
  }
}

function persistListening(session: ActiveSession): void {
  const tracker = session.tracker;
  if (!tracker) return;
  const listenedMs = tracker.snapshot.listened_ms;
  const events = tracker.snapshot.observations?.length ?? 0;
  if (!listenedMs || (listenedMs === session.lastQueuedMs && events === session.lastQueuedEvents
    && tracker.snapshot.ended_at === session.lastQueuedEndedAt)) return;
  session.lastQueuedMs = listenedMs;
  session.lastQueuedEvents = events;
  session.lastQueuedEndedAt = tracker.snapshot.ended_at;
  const snapshot = tracker.checkpoint();
  writeChain = writeChain.catch(() => {}).then(async () => {
    await window.api.invoke('profile:record-listening', snapshot);
    if (!session.counted) {
      session.counted = true;
      void mergeLibraryTrackSummaries([snapshot.track_id]).catch(reportListeningFailure);
    }
    for (const listener of listeners) listener();
  });
  // Attach a rejection observer immediately, including for fire-and-forget
  // periodic checkpoints. A lifecycle flush still awaits the original promise.
  void writeChain.catch((error) => {
    if (session.lastQueuedMs === snapshot.listened_ms
      && session.lastQueuedEndedAt === snapshot.ended_at) session.lastQueuedMs = -1;
    reportListeningFailure(error);
  });
}

function reportListeningFailure(error: unknown): void {
  console.warn('[Profile] Could not persist measured listening time.', error);
}
