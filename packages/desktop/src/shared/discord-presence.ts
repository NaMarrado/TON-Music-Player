export const TON_DISCORD_APPLICATION_ID = '1525668555163566212';
export const DISCORD_PRESENCE_SETTING_KEY = 'discord_rich_presence_enabled';

export type DiscordPresenceSettingKey = typeof DISCORD_PRESENCE_SETTING_KEY;

export interface DiscordPresencePayload {
  capturedAtMs: number;
  durationSeconds: number;
  isPlaying: boolean;
  positionSeconds: number;
  track: {
    artist: string | null;
    id: number;
    title: string | null;
    youtubeId: string | null;
  };
}

export function isDiscordPresencePayload(value: unknown): value is DiscordPresencePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<DiscordPresencePayload>;
  const track = payload.track as Partial<DiscordPresencePayload['track']> | undefined;

  return Boolean(
    track
    && typeof track.id === 'number'
    && Number.isInteger(track.id)
    && (track.title === null || typeof track.title === 'string')
    && (track.artist === null || typeof track.artist === 'string')
    && (track.youtubeId === null || typeof track.youtubeId === 'string')
    && typeof payload.isPlaying === 'boolean'
    && typeof payload.positionSeconds === 'number'
    && Number.isFinite(payload.positionSeconds)
    && typeof payload.durationSeconds === 'number'
    && Number.isFinite(payload.durationSeconds)
    && typeof payload.capturedAtMs === 'number'
    && Number.isFinite(payload.capturedAtMs),
  );
}
