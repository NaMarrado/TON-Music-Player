import { audibleTracks, clipDurationSec, clipEndSec, clipPitchRatio } from './timeline';
import type { StudioFade, StudioProject } from './types';

export interface PlaybackItem {
  clipId: string;
  trackId: string;
  assetId: string;
  /** Seconds after "play" at which this clip begins (0 when it is already running). */
  delaySec: number;
  /** Where in the source file playback starts. */
  sourceOffsetSec: number;
  /** Length of source audio this item plays. */
  sourceLengthSec: number;
  /** AudioBufferSourceNode.playbackRate: tempo, with pitch following. */
  playbackRate: number;
  /** Extra pitch factor the pitch-shifter must apply on top of playbackRate (1 = none). */
  pitchCorrection: number;
  reverse: boolean;
  gain: number;
  /** How far into the clip's own timeline playback starts (to continue a fade that is already running). */
  clipOffsetSec: number;
  clipDurationSec: number;
  fadeIn: StudioFade;
  fadeOut: StudioFade;
}

/** Everything that must sound when playing from `fromSec`, with timings relative to that moment. */
export function planPlayback(project: StudioProject, fromSec: number): PlaybackItem[] {
  const items: PlaybackItem[] = [];
  for (const track of audibleTracks(project)) {
    for (const clip of track.clips) {
      const end = clipEndSec(clip);
      if (end <= fromSec || !project.assets[clip.assetId]) continue;
      const elapsed = Math.max(0, fromSec - clip.startSec);
      const travelled = elapsed * clip.speed;
      const length = clip.outSec - clip.inSec - travelled;
      if (!(length > 0)) continue;
      const pitch = clipPitchRatio(clip);
      items.push({
        clipId: clip.id,
        trackId: track.id,
        assetId: clip.assetId,
        delaySec: Math.max(0, clip.startSec - fromSec),
        sourceOffsetSec: clip.reverse ? clip.outSec - travelled - length : clip.inSec + travelled,
        sourceLengthSec: length,
        playbackRate: clip.speed,
        pitchCorrection: pitch / clip.speed,
        reverse: clip.reverse,
        gain: 10 ** (clip.gainDb / 20),
        clipOffsetSec: elapsed,
        clipDurationSec: clipDurationSec(clip),
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
      });
    }
  }
  return items;
}
