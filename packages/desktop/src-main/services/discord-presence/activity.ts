import type { SetActivity } from '@xhayper/discord-rpc';
import type { DiscordPresencePayload } from '../../../src/shared/discord-presence';

const DISCORD_TEXT_MAX_LENGTH = 128;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function truncateDiscordText(value: string): string {
  return Array.from(value).slice(0, DISCORD_TEXT_MAX_LENGTH).join('');
}

function normalizeDiscordText(value: string | null, fallback: string): string {
  const normalized = value?.trim() || fallback;
  return truncateDiscordText(normalized.length >= 2 ? normalized : fallback);
}

export function getDiscordArtworkUrl(youtubeId: string | null): string | undefined {
  if (!youtubeId || !YOUTUBE_ID_PATTERN.test(youtubeId)) return undefined;
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function getDiscordPresenceFingerprint(payload: DiscordPresencePayload): string {
  const playbackAnchorSeconds = payload.isPlaying
    ? Math.round((payload.capturedAtMs - payload.positionSeconds * 1000) / 1000)
    : null;
  return JSON.stringify({
    artist: payload.track.artist?.trim() || null,
    durationSeconds: Math.round(Math.max(0, payload.durationSeconds)),
    isPlaying: payload.isPlaying,
    playbackAnchorSeconds,
    title: payload.track.title?.trim() || null,
    trackId: payload.track.id,
    youtubeId: payload.track.youtubeId,
  });
}

export function buildDiscordActivity(
  payload: DiscordPresencePayload,
  nowMs = Date.now(),
): SetActivity {
  const title = normalizeDiscordText(payload.track.title, 'Unknown track');
  const artist = normalizeDiscordText(payload.track.artist, 'Unknown artist');
  const duration = Math.max(0, payload.durationSeconds);
  const elapsedSinceCapture = payload.isPlaying
    ? Math.max(0, (nowMs - payload.capturedAtMs) / 1000)
    : 0;
  const position = duration > 0
    ? clamp(payload.positionSeconds + elapsedSinceCapture, 0, duration)
    : Math.max(0, payload.positionSeconds + elapsedSinceCapture);
  const artworkUrl = getDiscordArtworkUrl(payload.track.youtubeId);
  const activity: SetActivity = {
    type: 2,
    details: title,
    state: payload.isPlaying
      ? artist
      : truncateDiscordText(`${artist} · Paused`),
    largeImageText: truncateDiscordText(`${title} — ${artist}`),
    instance: false,
  };

  if (artworkUrl) activity.largeImageKey = artworkUrl;

  if (payload.isPlaying) {
    const startTimestamp = Math.round(nowMs - position * 1000);
    activity.startTimestamp = startTimestamp;
    if (duration > position) {
      activity.endTimestamp = Math.round(startTimestamp + duration * 1000);
    }
  }

  return activity;
}
