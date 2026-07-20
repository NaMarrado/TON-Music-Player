export interface PlaybackRuntimeTrack {
  id?: string;
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  loudnessGainDb?: number;
  playbackQueueIndex?: number;
  playbackQueueCount?: number;
  [key: string]: unknown;
}

export interface PlaybackRuntimeProgress {
  buffered: number;
  duration: number;
  position: number;
}

export interface PlaybackRuntimeStateSnapshot {
  state: PlaybackRuntimeStateValue;
  error?: unknown;
  trackId?: string | number;
}

export interface PlaybackRuntimeUpdateOptions {
  capabilities?: number[];
  compactCapabilities?: number[];
  notificationCapabilities?: number[];
  progressUpdateEventInterval?: number;
  [key: string]: unknown;
}

export interface PlaybackRuntimeQueueOptions {
  autoplay: boolean;
  startIndex: number;
}

export const PlaybackEvent = {
  MetadataChapterReceived: 'metadata-chapter-received',
  MetadataCommonReceived: 'metadata-common-received',
  MetadataTimedReceived: 'metadata-timed-received',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackError: 'playback-error',
  PlaybackMetadataReceived: 'playback-metadata-received',
  PlaybackPlayWhenReadyChanged: 'playback-play-when-ready-changed',
  PlaybackProgressUpdated: 'playback-progress-updated',
  PlaybackQueueEnded: 'playback-queue-ended',
  PlaybackState: 'playback-state',
  PlaybackTrackChanged: 'playback-track-changed',
  PlayerError: 'player-error',
  RemoteBookmark: 'remote-bookmark',
  RemoteDislike: 'remote-dislike',
  RemoteDuck: 'remote-duck',
  RemoteJumpBackward: 'remote-jump-backward',
  RemoteJumpForward: 'remote-jump-forward',
  RemoteLike: 'remote-like',
  RemoteNext: 'remote-next',
  RemotePause: 'remote-pause',
  RemotePlay: 'remote-play',
  RemotePlayId: 'remote-play-id',
  RemotePlaySearch: 'remote-play-search',
  RemotePrevious: 'remote-previous',
  RemoteRepeat: 'remote-repeat',
  RemoteSeek: 'remote-seek',
  RemoteShuffle: 'remote-shuffle',
  RemoteSetRating: 'remote-set-rating',
  RemoteSkip: 'remote-skip',
  RemoteStop: 'remote-stop',
} as const;

export const PlaybackStateValue = {
  Buffering: 'buffering',
  Connecting: 'loading',
  Ended: 'ended',
  Error: 'error',
  Loading: 'loading',
  None: 'none',
  Paused: 'paused',
  Playing: 'playing',
  Ready: 'ready',
  Stopped: 'stopped',
} as const;

export const PlaybackRepeatModeValue = {
  Off: 0,
  Queue: 2,
  Track: 1,
} as const;

export type PlaybackRuntimeEventType = typeof PlaybackEvent[keyof typeof PlaybackEvent];
export type PlaybackRuntimeStateValue = typeof PlaybackStateValue[keyof typeof PlaybackStateValue];
export type PlaybackRuntimeRepeatModeValue =
  typeof PlaybackRepeatModeValue[keyof typeof PlaybackRepeatModeValue];

export type PlaybackRuntimeEventPayload<T extends PlaybackRuntimeEventType> =
  T extends typeof PlaybackEvent.PlaybackActiveTrackChanged
    ? {
      index?: number;
      lastIndex?: number;
      lastTrack?: PlaybackRuntimeTrack | null;
      track?: PlaybackRuntimeTrack | null;
    }
    : T extends typeof PlaybackEvent.PlaybackState
      ? PlaybackRuntimeStateSnapshot
    : T extends typeof PlaybackEvent.PlaybackError | typeof PlaybackEvent.PlayerError
      ? { code?: string; message?: string }
      : T extends typeof PlaybackEvent.PlaybackQueueEnded
        ? { position?: number; track?: PlaybackRuntimeTrack | null }
        : T extends typeof PlaybackEvent.RemoteDuck
          ? { paused: boolean; permanent: boolean }
    : T extends typeof PlaybackEvent.RemoteSeek
      ? { position: number }
      : T extends typeof PlaybackEvent.RemoteRepeat
        ? { mode: 'all' | 'one' }
      : T extends typeof PlaybackEvent.RemoteShuffle
        ? { enabled: boolean }
      : T extends typeof PlaybackEvent.RemotePlayId
        ? { id: string }
      : never;
