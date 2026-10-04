import { sanitizeClip } from './project-ops';
import { clipDurationSec, clipEndSec, findClip } from './timeline';
import type { StudioClip, StudioProject } from './types';

/** Source positions closer than this (in seconds of the song) count as the same spot. */
const SAME_SPOT_SEC = 0.001;

/** True when `next` plays the audio that comes right after `previous`, with the same song, direction and sound. */
function continues(previous: StudioClip, next: StudioClip): boolean {
  if (previous.id === next.id || previous.assetId !== next.assetId || previous.reverse !== next.reverse) return false;
  if (previous.speed !== next.speed || previous.pitchLock !== next.pitchLock || previous.semitones !== next.semitones) return false;
  // A reversed clip plays from outSec down to inSec, so the piece after it ends where it starts.
  const gap = previous.reverse ? next.outSec - previous.inSec : next.inSec - previous.outSec;
  return Math.abs(gap) < SAME_SPOT_SEC;
}

/**
 * The reverse of Cut here. When the selected clip and another clip on its lane are two pieces of the same audio, they
 * become one clip again at the position of the first piece (so a piece that was dragged away snaps back). Otherwise the
 * selected clip is moved so it touches the clip before it on its lane (or, if there is none, the clip after it) with no
 * gap and no overlap. Returns the same project when there is nothing to connect.
 */
export function connectClip(project: StudioProject, clipId: string): StudioProject {
  const found = findClip(project, clipId);
  if (!found) return project;
  const { clip, track } = found;
  const others = track.clips.filter((candidate) => candidate.id !== clip.id);
  const partner = others.find((candidate) => continues(clip, candidate) || continues(candidate, clip));
  if (partner) {
    const [first, second] = continues(clip, partner) ? [clip, partner] : [partner, clip];
    const merged: StudioClip = first.reverse
      ? { ...first, inSec: second.inSec, fadeOut: { ...second.fadeOut } }
      : { ...first, outSec: second.outSec, fadeOut: { ...second.fadeOut } };
    const joined = sanitizeClip(merged, project.assets[first.assetId]);
    return {
      ...project,
      tracks: project.tracks.map((candidate) => (candidate.id !== track.id ? candidate : {
        ...candidate,
        clips: candidate.clips.flatMap((item) => (item.id === first.id ? [joined] : item.id === second.id ? [] : [item])),
      })),
    };
  }

  const before = others.filter((candidate) => candidate.startSec <= clip.startSec).sort((a, b) => b.startSec - a.startSec)[0];
  const after = others.filter((candidate) => candidate.startSec > clip.startSec).sort((a, b) => a.startSec - b.startSec)[0];
  let startSec = clip.startSec;
  if (before) startSec = clipEndSec(before);
  else if (after) startSec = Math.max(0, after.startSec - clipDurationSec(clip));
  if (Math.abs(startSec - clip.startSec) < SAME_SPOT_SEC) return project;
  return {
    ...project,
    tracks: project.tracks.map((candidate) => (candidate.id !== track.id ? candidate : {
      ...candidate,
      clips: candidate.clips.map((item) => (item.id === clip.id ? { ...item, startSec } : item)),
    })),
  };
}
