import { updateClip, updateTrackEffects } from './project-ops';
import { defaultEffects, type StudioEffects, type StudioProject } from './types';

export type StudioPreset = 'slowed' | 'slowedReverb' | 'spedUp' | 'bassBoost' | 'muffled' | 'reset';

export const STUDIO_PRESETS: StudioPreset[] = ['slowed', 'slowedReverb', 'spedUp', 'bassBoost', 'muffled', 'reset'];

interface PresetDefinition {
  /** Speed for every clip of the lane (vinyl style: pitch follows). `null` leaves the speed alone. */
  speed: number | null;
  effects: Partial<StudioEffects>;
}

const DEFINITIONS: Record<StudioPreset, PresetDefinition> = {
  slowed: { speed: 0.85, effects: {} },
  slowedReverb: { speed: 0.85, effects: { reverb: { mix: 0.35, size: 0.6, damping: 0.4 } } },
  spedUp: { speed: 1.25, effects: {} },
  bassBoost: { speed: null, effects: { bassDb: 9 } },
  muffled: { speed: null, effects: { filter: { type: 'lowpass', hz: 1200 } } },
  reset: { speed: 1, effects: defaultEffects() },
};

/** Applies a preset to one lane: the speed of its clips and its effects. Everything else (fades, cuts, volume) stays. */
export function applyPreset(project: StudioProject, trackId: string, preset: StudioPreset): StudioProject {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return project;
  const definition = DEFINITIONS[preset];
  let next = project;
  if (definition.speed !== null) {
    for (const clip of track.clips) {
      next = updateClip(next, clip.id, preset === 'reset'
        ? { speed: 1, pitchLock: false, semitones: 0, reverse: false }
        : { speed: definition.speed, pitchLock: false });
    }
  }
  return updateTrackEffects(next, trackId, { ...definition.effects });
}
