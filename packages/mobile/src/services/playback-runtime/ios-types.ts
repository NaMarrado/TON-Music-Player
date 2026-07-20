import type {
  PlaybackRuntimeProgress,
  PlaybackRuntimeTrack,
} from './types';

export type IosPlaybackRuntimeState =
  | 'none'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'loading'
  | 'buffering'
  | 'error'
  | 'ended';

export interface IosPlaybackRuntimeStateSnapshot {
  state: IosPlaybackRuntimeState;
}

export interface IosPlaybackRuntimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface IosPlaybackRuntimeModule {
  setupPlayer(): Promise<void>;
  updateOptions(options: Record<string, unknown>): Promise<void>;
  setQueue(tracks: PlaybackRuntimeTrack[]): Promise<void>;
  replaceQueue(
    tracks: PlaybackRuntimeTrack[],
    startIndex: number,
    autoplay: boolean,
  ): Promise<void>;
  add(tracks: PlaybackRuntimeTrack[]): Promise<void>;
  load(track: PlaybackRuntimeTrack): Promise<void>;
  play(): Promise<void>;
  primeRemoteSession(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(position: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setRepeatMode(mode: number): Promise<void>;
  setShuffleEnabled(enabled: boolean): Promise<void>;
  skip(index: number): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  removeUpcomingTracks(): Promise<void>;
  getPosition(): Promise<number>;
  getProgress(): Promise<PlaybackRuntimeProgress>;
  getPlaybackState(): Promise<IosPlaybackRuntimeStateSnapshot>;
  getActiveTrack(): Promise<PlaybackRuntimeTrack | null>;
  getActiveTrackIndex(): Promise<number | null>;
  setPitch(ratio: number): Promise<void>;
  getAudioSessionId(): Promise<number>;
  attachEqualizer(sessionId: number): Promise<{
    bandCount: number;
    frequencies: number[];
    levelRange: { min: number; max: number };
  }>;
  setEqEnabled(enabled: boolean): Promise<void>;
  setEqBandLevel(index: number, level: number): Promise<void>;
  setAudioBoostTargetGain(value: number): Promise<void>;
  setLoudnessNormalizationEnabled(enabled: boolean): Promise<void>;
  releaseAudioBoost(): Promise<void>;
}
