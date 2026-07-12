import type { Track } from '@ton/core';
import { DISCORD_PRESENCE_SETTING_KEY, type DiscordPresencePayload } from '../../shared/discord-presence';
import { usePlaybackStore, type PlaybackState } from '../../stores/playback-store';
import { useDiscordPresenceStore } from './store';

const SEEK_RESYNC_THRESHOLD_SECONDS = 2;

interface SentPlaybackSnapshot {
  capturedAtMs: number;
  durationSeconds: number;
  isPlaying: boolean;
  positionSeconds: number;
  trackId: number;
}

let initializePromise: Promise<void> | null = null;
let unsubscribePlayback: (() => void) | null = null;
let startedTrackId: number | null = null;
let lastSent: SentPlaybackSnapshot | null = null;

export function initializeDiscordPresence(): Promise<void> {
  initializePromise ??= initialize();
  return initializePromise;
}

export async function setDiscordPresenceEnabled(enabled: boolean): Promise<void> {
  await window.api.invoke('settings:set', DISCORD_PRESENCE_SETTING_KEY, String(enabled));
  useDiscordPresenceStore.setState({ enabled, loaded: true });
  if (!enabled) {
    lastSent = null;
    await clearPresence();
    return;
  }

  syncCurrentPlayback(usePlaybackStore.getState(), true);
}

async function initialize(): Promise<void> {
  const stored = await window.api.invoke('settings:get', DISCORD_PRESENCE_SETTING_KEY);
  const enabled = stored !== 'false';
  useDiscordPresenceStore.setState({ enabled, loaded: true });

  unsubscribePlayback ??= usePlaybackStore.subscribe(handlePlaybackChange);
  const state = usePlaybackStore.getState();
  if (state.currentTrack && state.isPlaying) startedTrackId = state.currentTrack.id;
  if (enabled) syncCurrentPlayback(state, true);
}

function handlePlaybackChange(state: PlaybackState, previous: PlaybackState): void {
  const trackId = state.currentTrack?.id ?? null;
  const previousTrackId = previous.currentTrack?.id ?? null;

  if (trackId !== previousTrackId) {
    startedTrackId = state.isPlaying ? trackId : null;
    lastSent = null;
    if (!state.isPlaying || !state.currentTrack) {
      void clearPresence();
      return;
    }
    syncCurrentPlayback(state, true);
    return;
  }

  if (!state.currentTrack) {
    startedTrackId = null;
    lastSent = null;
    void clearPresence();
    return;
  }

  if (state.isPlaying !== previous.isPlaying) {
    if (state.isPlaying) startedTrackId = state.currentTrack.id;
    syncCurrentPlayback(state, true);
    return;
  }

  if (startedTrackId !== state.currentTrack.id) return;

  if (Math.abs(state.duration - previous.duration) >= 0.5) {
    syncCurrentPlayback(state, true);
    return;
  }

  if (state.isPlaying && didSeek(state)) syncCurrentPlayback(state, true);
}

function didSeek(state: PlaybackState): boolean {
  if (!lastSent || lastSent.trackId !== state.currentTrack?.id || !lastSent.isPlaying) return false;
  const elapsed = (Date.now() - lastSent.capturedAtMs) / 1000;
  const expected = lastSent.positionSeconds + elapsed;
  return Math.abs(state.position - expected) >= SEEK_RESYNC_THRESHOLD_SECONDS;
}

function syncCurrentPlayback(state: PlaybackState, force: boolean): void {
  const { enabled } = useDiscordPresenceStore.getState();
  const track = state.currentTrack;
  if (!enabled || !track || startedTrackId !== track.id) {
    if (force) void clearPresence();
    return;
  }

  const capturedAtMs = Date.now();
  const payload = createPresencePayload(track, state, capturedAtMs);
  lastSent = {
    capturedAtMs,
    durationSeconds: payload.durationSeconds,
    isPlaying: payload.isPlaying,
    positionSeconds: payload.positionSeconds,
    trackId: track.id,
  };
  void window.api.invoke('discord:sync-activity', payload).catch(() => {});
}

function createPresencePayload(
  track: Track,
  state: PlaybackState,
  capturedAtMs: number,
): DiscordPresencePayload {
  return {
    capturedAtMs,
    durationSeconds: Math.max(0, state.duration),
    isPlaying: state.isPlaying,
    positionSeconds: Math.max(0, state.position),
    track: {
      artist: track.artist,
      id: track.id,
      title: track.title,
      youtubeId: track.youtube_id,
    },
  };
}

async function clearPresence(): Promise<void> {
  await window.api.invoke('discord:clear-activity').catch(() => {});
}

export { useDiscordPresenceStore } from './store';
