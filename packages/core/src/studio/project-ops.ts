import { clipDurationSec, clipEndSec, clampSpeed, findClip } from './timeline';
import type {
  StudioAsset,
  StudioClip,
  StudioEffects,
  StudioFade,
  StudioFadeCurve,
  StudioProject,
  StudioTrack,
} from './types';
import { NO_FADE, STUDIO_MIN_CLIP_SEC, defaultEffects } from './types';

export type StudioClipPatch = Partial<Omit<StudioClip, 'id' | 'assetId'>>;

const finiteOr = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

/** Keeps every clip inside its asset, longer than the minimum, with fades that fit. */
export function sanitizeClip(clip: StudioClip, asset: StudioAsset | undefined): StudioClip {
  const assetEnd = asset ? Math.max(asset.durationSec, STUDIO_MIN_CLIP_SEC) : Number.POSITIVE_INFINITY;
  const speed = clampSpeed(finiteOr(clip.speed, 1));
  let inSec = Math.min(Math.max(0, finiteOr(clip.inSec, 0)), assetEnd - STUDIO_MIN_CLIP_SEC * speed);
  let outSec = Math.min(assetEnd, finiteOr(clip.outSec, assetEnd));
  if (outSec - inSec < STUDIO_MIN_CLIP_SEC * speed) outSec = Math.min(assetEnd, inSec + STUDIO_MIN_CLIP_SEC * speed);
  if (outSec - inSec < STUDIO_MIN_CLIP_SEC * speed) inSec = Math.max(0, outSec - STUDIO_MIN_CLIP_SEC * speed);
  const next: StudioClip = {
    ...clip,
    startSec: Math.max(0, finiteOr(clip.startSec, 0)),
    inSec,
    outSec,
    speed,
    semitones: Math.min(24, Math.max(-24, finiteOr(clip.semitones, 0))),
    gainDb: Math.min(24, Math.max(-60, finiteOr(clip.gainDb, 0))),
  };
  const duration = clipDurationSec(next);
  const fadeIn = sanitizeFade(clip.fadeIn, duration);
  const fadeOut = sanitizeFade(clip.fadeOut, duration);
  // The two fades may overlap inside one clip only by sharing the available length.
  const total = fadeIn.seconds + fadeOut.seconds;
  if (total > duration && total > 0) {
    const scale = duration / total;
    return { ...next, fadeIn: { ...fadeIn, seconds: fadeIn.seconds * scale }, fadeOut: { ...fadeOut, seconds: fadeOut.seconds * scale } };
  }
  return { ...next, fadeIn, fadeOut };
}

function sanitizeFade(fade: StudioFade, clipDuration: number): StudioFade {
  return { curve: fade.curve, seconds: Math.min(Math.max(0, finiteOr(fade.seconds, 0)), clipDuration) };
}

export function createClip(id: string, asset: StudioAsset, startSec: number): StudioClip {
  return sanitizeClip({
    id,
    assetId: asset.id,
    startSec,
    inSec: 0,
    outSec: asset.durationSec,
    speed: 1,
    pitchLock: false,
    semitones: 0,
    reverse: false,
    gainDb: 0,
    fadeIn: { ...NO_FADE },
    fadeOut: { ...NO_FADE },
  }, asset);
}

/** Songs put into the Studio start quiet: at full volume a single song is already much louder than the player. */
export const STUDIO_NEW_LANE_VOLUME = 0.5;
/** New clips start at half volume too (about -6 dB), so a freshly added song is a quarter of its full level. */
export const STUDIO_NEW_CLIP_GAIN_DB = 20 * Math.log10(0.5);
/** Song and clip volume both go up to 500 %. */
export const STUDIO_MAX_VOLUME = 5;
/** Bass and treble go up to the strongest boost or cut the audio filters allow. */
export const STUDIO_MAX_TONE_DB = 40;

/** A clip's gain as a linear factor (1 = 100 %), the way the volume slider shows it. */
export function clipGainToLinear(gainDb: number): number {
  return gainDb <= -60 ? 0 : 10 ** (gainDb / 20);
}

/** The gain for a linear factor from the volume slider; 0 % becomes the quietest allowed gain (-60 dB). */
export function linearToClipGain(linear: number): number {
  return linear <= 0.001 ? -60 : 20 * Math.log10(linear);
}

export function createTrack(id: string, clips: StudioClip[] = [], volume = 1): StudioTrack {
  return { id, clips, volume, muted: false, solo: false, effects: defaultEffects() };
}

export function addAsset(project: StudioProject, asset: StudioAsset): StudioProject {
  return { ...project, assets: { ...project.assets, [asset.id]: asset } };
}

export function setAssetAnalysis(project: StudioProject, assetId: string, analysis: { bpm: number | null; key: string | null }): StudioProject {
  const asset = project.assets[assetId];
  if (!asset) return project;
  const assets = { ...project.assets, [assetId]: { ...asset, bpm: analysis.bpm, key: analysis.key } };
  return { ...project, assets, gridBpm: project.gridBpm ?? analysis.bpm };
}

/** Metadata durations can differ from the decoded audio; trust the decoded one and keep every clip inside it. */
export function updateAssetDuration(project: StudioProject, assetId: string, durationSec: number): StudioProject {
  const asset = project.assets[assetId];
  if (!asset || !Number.isFinite(durationSec) || durationSec <= 0 || Math.abs(asset.durationSec - durationSec) < 0.001) return project;
  const next: StudioProject = { ...project, assets: { ...project.assets, [assetId]: { ...asset, durationSec } } };
  return {
    ...next,
    tracks: next.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.assetId === assetId ? sanitizeClip({ ...clip, outSec: Math.min(clip.outSec, durationSec) }, next.assets[assetId]) : clip)),
    })),
  };
}

export function addTrack(project: StudioProject, track: StudioTrack): StudioProject {
  return { ...project, tracks: [...project.tracks, track] };
}

export function removeTrack(project: StudioProject, trackId: string): StudioProject {
  return { ...project, tracks: project.tracks.filter((track) => track.id !== trackId) };
}

export function updateTrack(project: StudioProject, trackId: string, patch: Partial<Pick<StudioTrack, 'volume' | 'muted' | 'solo'>>): StudioProject {
  return mapTrack(project, trackId, (track) => ({
    ...track,
    ...patch,
    volume: patch.volume === undefined ? track.volume : Math.min(STUDIO_MAX_VOLUME, Math.max(0, finiteOr(patch.volume, 1))),
  }));
}

export function updateTrackEffects(project: StudioProject, trackId: string, patch: Partial<StudioEffects>): StudioProject {
  return mapTrack(project, trackId, (track) => {
    const effects = { ...track.effects, ...patch };
    return {
      ...track,
      effects: {
        ...effects,
        bassDb: Math.min(STUDIO_MAX_TONE_DB, Math.max(-STUDIO_MAX_TONE_DB, finiteOr(effects.bassDb, 0))),
        trebleDb: Math.min(STUDIO_MAX_TONE_DB, Math.max(-STUDIO_MAX_TONE_DB, finiteOr(effects.trebleDb, 0))),
        pan: Math.min(1, Math.max(-1, finiteOr(effects.pan, 0))),
      },
    };
  });
}

export function addClipToTrack(project: StudioProject, trackId: string, clip: StudioClip): StudioProject {
  return mapTrack(project, trackId, (track) => ({ ...track, clips: [...track.clips, sanitizeClip(clip, project.assets[clip.assetId])] }));
}

export function updateClip(project: StudioProject, clipId: string, patch: StudioClipPatch): StudioProject {
  return mapClip(project, clipId, (clip) => sanitizeClip({ ...clip, ...patch }, project.assets[clip.assetId]));
}

/** Moves a clip on the timeline and, optionally, to another track. */
export function moveClip(project: StudioProject, clipId: string, startSec: number, toTrackId?: string): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  const moved = sanitizeClip({ ...found.clip, startSec }, project.assets[found.clip.assetId]);
  if (!toTrackId || toTrackId === found.track.id) return mapClip(project, clipId, () => moved);
  if (!project.tracks.some((track) => track.id === toTrackId)) return project;
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.id === found.track.id) return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
      if (track.id === toTrackId) return { ...track, clips: [...track.clips, moved] };
      return track;
    }),
  };
}

/** Moves the left edge of a clip; the audio that stays audible keeps its place on the timeline. */
export function trimClipStart(project: StudioProject, clipId: string, newStartSec: number): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  const { clip } = found;
  const minStart = clip.startSec - (clip.reverse ? (project.assets[clip.assetId]?.durationSec ?? Infinity) - clip.outSec : clip.inSec) / clip.speed;
  const start = Math.min(Math.max(newStartSec, Math.max(0, minStart)), clipEndSec(clip) - STUDIO_MIN_CLIP_SEC);
  const delta = (start - clip.startSec) * clip.speed;
  return mapClip(project, clipId, (current) => sanitizeClip(
    current.reverse
      ? { ...current, startSec: start, outSec: current.outSec - delta }
      : { ...current, startSec: start, inSec: current.inSec + delta },
    project.assets[current.assetId],
  ));
}

/** Moves the right edge of a clip. */
export function trimClipEnd(project: StudioProject, clipId: string, newEndSec: number): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  const { clip } = found;
  const assetEnd = project.assets[clip.assetId]?.durationSec ?? Number.POSITIVE_INFINITY;
  const maxDuration = (clip.reverse ? clip.outSec : assetEnd - clip.inSec) / clip.speed;
  const end = Math.min(Math.max(newEndSec, clip.startSec + STUDIO_MIN_CLIP_SEC), clip.startSec + maxDuration);
  const sourceLength = (end - clip.startSec) * clip.speed;
  return mapClip(project, clipId, (current) => sanitizeClip(
    current.reverse
      ? { ...current, inSec: current.outSec - sourceLength }
      : { ...current, outSec: current.inSec + sourceLength },
    project.assets[current.assetId],
  ));
}

/** Splits a clip in two at a timeline position. Returns the same project when the cut is too close to an edge. */
export function splitClip(project: StudioProject, clipId: string, atSec: number, newClipId: string): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  const { clip, track } = found;
  if (atSec <= clip.startSec + STUDIO_MIN_CLIP_SEC || atSec >= clipEndSec(clip) - STUDIO_MIN_CLIP_SEC) return project;
  const travelled = (atSec - clip.startSec) * clip.speed;
  const first: StudioClip = clip.reverse
    ? { ...clip, inSec: clip.outSec - travelled, fadeOut: { ...NO_FADE } }
    : { ...clip, outSec: clip.inSec + travelled, fadeOut: { ...NO_FADE } };
  const second: StudioClip = clip.reverse
    ? { ...clip, id: newClipId, startSec: atSec, outSec: clip.outSec - travelled, fadeIn: { ...NO_FADE } }
    : { ...clip, id: newClipId, startSec: atSec, inSec: clip.inSec + travelled, fadeIn: { ...NO_FADE } };
  const asset = project.assets[clip.assetId];
  return mapTrack(project, track.id, (current) => ({
    ...current,
    clips: current.clips.flatMap((candidate) => (candidate.id === clipId ? [sanitizeClip(first, asset), sanitizeClip(second, asset)] : [candidate])),
  }));
}

export function duplicateClip(project: StudioProject, clipId: string, newClipId: string): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  const copy = sanitizeClip({ ...found.clip, id: newClipId, startSec: clipEndSec(found.clip) }, project.assets[found.clip.assetId]);
  return mapTrack(project, found.track.id, (track) => ({ ...track, clips: [...track.clips, copy] }));
}

export function deleteClip(project: StudioProject, clipId: string): StudioProject {
  return { ...project, tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== clipId) })) };
}

/**
 * Places `incoming` so it overlaps the end of `outgoing` by `seconds` and gives both matching fades, which is the
 * crossfade drawn as two curves in a DJ-style transition.
 */
export function placeTransition(
  project: StudioProject,
  outgoingId: string,
  incomingId: string,
  seconds: number,
  curve: StudioFadeCurve,
): StudioProject {
  const outgoing = findClip(project, outgoingId);
  const incoming = findClip(project, incomingId);
  if (!outgoing || !incoming || outgoing.clip.id === incoming.clip.id) return project;
  const overlap = Math.min(
    Math.max(0, seconds),
    clipDurationSec(outgoing.clip) - STUDIO_MIN_CLIP_SEC,
    clipDurationSec(incoming.clip) - STUDIO_MIN_CLIP_SEC,
  );
  if (!(overlap > 0)) return project;
  const start = Math.max(0, clipEndSec(outgoing.clip) - overlap);
  let next = mapClip(project, outgoingId, (clip) => sanitizeClip({ ...clip, fadeOut: { seconds: overlap, curve } }, project.assets[clip.assetId]));
  next = mapClip(next, incomingId, (clip) => sanitizeClip({ ...clip, startSec: start, fadeIn: { seconds: overlap, curve } }, project.assets[clip.assetId]));
  return next;
}

/** Sets the clip speed so its tempo matches `targetBpm` (keeping pitch), folding half/double time into 0.5..2. */
export function syncClipTempo(project: StudioProject, clipId: string, targetBpm: number): StudioProject {
  const found = findClip(project, clipId);
  const bpm = found ? project.assets[found.clip.assetId]?.bpm : null;
  if (!found || !bpm || !(targetBpm > 0)) return project;
  let speed = targetBpm / bpm;
  while (speed > 1.5) speed /= 2;
  while (speed < 0.75) speed *= 2;
  return mapClip(project, clipId, (clip) => sanitizeClip({ ...clip, speed, pitchLock: true }, project.assets[clip.assetId]));
}

function mapTrack(project: StudioProject, trackId: string, change: (track: StudioTrack) => StudioTrack): StudioProject {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId) return track;
    changed = true;
    return change(track);
  });
  return changed ? { ...project, tracks } : project;
}

function mapClip(project: StudioProject, clipId: string, change: (clip: StudioClip) => StudioClip): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  return mapTrack(project, found.track.id, (track) => ({ ...track, clips: track.clips.map((clip) => (clip.id === clipId ? change(clip) : clip)) }));
}
