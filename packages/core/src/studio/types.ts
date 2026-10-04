/**
 * Platform-independent model of a Studio project. Desktop (Web Audio preview + ffmpeg export) and mobile
 * (ffmpeg preview + export) both edit and render exactly this structure.
 *
 * Timeline units are seconds. A clip plays the source window [inSec, outSec] of its asset, `speed` times faster,
 * starting at `startSec` on the timeline, so it lasts (outSec - inSec) / speed seconds.
 */
export type StudioFadeCurve = 'linear' | 'equal-power' | 'exponential';

export interface StudioFade {
  seconds: number;
  curve: StudioFadeCurve;
}

export interface StudioReverb {
  /** Wet amount 0..1. */
  mix: number;
  /** Room size 0..1, mapped to a 0.4..4 second tail. */
  size: number;
  /** High-frequency damping of the tail 0..1. */
  damping: number;
}

export interface StudioEcho {
  mix: number;
  seconds: number;
  feedback: number;
}

export interface StudioFilter {
  type: 'lowpass' | 'highpass';
  hz: number;
}

export interface StudioEffects {
  bassDb: number;
  trebleDb: number;
  reverb: StudioReverb | null;
  echo: StudioEcho | null;
  filter: StudioFilter | null;
  /** -1 (left) .. 1 (right). */
  pan: number;
}

export interface StudioAsset {
  id: string;
  /** Opaque location understood by the platform (file path or media URL). */
  path: string;
  title: string;
  artist: string;
  durationSec: number;
  bpm: number | null;
  /** Camelot notation, e.g. "8A". */
  key: string | null;
  coverPath: string | null;
  /** True when the file only exists for this Studio session and is not in the Library. */
  temporary: boolean;
}

export interface StudioClip {
  id: string;
  assetId: string;
  startSec: number;
  inSec: number;
  outSec: number;
  /** Playback speed factor, 0.25..4. */
  speed: number;
  /** When true, speed does not change the pitch (time-stretch). When false, pitch follows speed (vinyl). */
  pitchLock: boolean;
  /** Extra pitch shift in semitones, independent of speed. */
  semitones: number;
  reverse: boolean;
  gainDb: number;
  fadeIn: StudioFade;
  fadeOut: StudioFade;
}

export interface StudioTrack {
  id: string;
  clips: StudioClip[];
  /** Linear volume, 1 = unchanged. */
  volume: number;
  muted: boolean;
  solo: boolean;
  effects: StudioEffects;
}

export interface StudioProject {
  tracks: StudioTrack[];
  assets: Record<string, StudioAsset>;
  /** Reference tempo for the beat grid; null until a lane provides one. */
  gridBpm: number | null;
  masterGainDb: number;
}

export const STUDIO_SAMPLE_RATE = 44100;
export const STUDIO_MIN_SPEED = 0.25;
export const STUDIO_MAX_SPEED = 4;
export const STUDIO_MIN_CLIP_SEC = 0.02;

export const NO_FADE: StudioFade = { seconds: 0, curve: 'equal-power' };

export function defaultEffects(): StudioEffects {
  return { bassDb: 0, trebleDb: 0, reverb: null, echo: null, filter: null, pan: 0 };
}

export function createEmptyProject(): StudioProject {
  return { tracks: [], assets: {}, gridBpm: null, masterGainDb: 0 };
}
