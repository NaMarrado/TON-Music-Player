import type { StudioAsset, StudioClip, StudioProject, StudioTrack } from './types';
import { STUDIO_MAX_SPEED, STUDIO_MIN_SPEED } from './types';

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(STUDIO_MAX_SPEED, Math.max(STUDIO_MIN_SPEED, speed));
}

/** How long the clip lasts on the timeline. */
export function clipDurationSec(clip: StudioClip): number {
  return Math.max(0, clip.outSec - clip.inSec) / clip.speed;
}

export function clipEndSec(clip: StudioClip): number {
  return clip.startSec + clipDurationSec(clip);
}

export function trackEndSec(track: StudioTrack): number {
  let end = 0;
  for (const clip of track.clips) end = Math.max(end, clipEndSec(clip));
  return end;
}

export function projectDurationSec(project: StudioProject): number {
  let end = 0;
  for (const track of project.tracks) end = Math.max(end, trackEndSec(track));
  return end;
}

/** Pitch factor a clip applies on top of the source: vinyl-style speed moves pitch, pitch lock does not. */
export function clipPitchRatio(clip: StudioClip): number {
  return (clip.pitchLock ? 1 : clip.speed) * 2 ** (clip.semitones / 12);
}

/** Position inside the source file that plays at `timelineSec`, clamped to the clip's source window. */
export function sourceTimeAt(clip: StudioClip, timelineSec: number): number {
  const travelled = Math.max(0, (timelineSec - clip.startSec) * clip.speed);
  const position = clip.reverse ? clip.outSec - travelled : clip.inSec + travelled;
  return Math.min(clip.outSec, Math.max(clip.inSec, position));
}

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

export function secondsPerBar(bpm: number, beatsPerBar = 4): number {
  return (60 / bpm) * beatsPerBar;
}

/** Tempo a clip is heard at once its speed is applied. */
export function clipBpm(clip: StudioClip, asset: StudioAsset | undefined): number | null {
  if (!asset || asset.bpm === null) return null;
  return asset.bpm * clip.speed;
}

/** Snaps to the nearest multiple of `division` beats counted from `originSec`. */
export function snapToBeat(timeSec: number, bpm: number, division = 1, originSec = 0): number {
  const step = secondsPerBeat(bpm) * division;
  if (!(step > 0)) return timeSec;
  return originSec + Math.round((timeSec - originSec) / step) * step;
}

export function findClip(project: StudioProject, clipId: string): { track: StudioTrack; clip: StudioClip; trackIndex: number; clipIndex: number } | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex += 1) {
    const track = project.tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex >= 0) return { track, clip: track.clips[clipIndex], trackIndex, clipIndex };
  }
  return null;
}

/** Tracks that should be heard: solo wins over mute. */
export function audibleTracks(project: StudioProject): StudioTrack[] {
  const anySolo = project.tracks.some((track) => track.solo);
  return project.tracks.filter((track) => (anySolo ? track.solo : !track.muted));
}
