import fs from 'node:fs';
import path from 'node:path';
import { STUDIO_MAX_TONE_DB, STUDIO_MAX_VOLUME, SUPPORTED_AUDIO_EXTENSIONS, type StudioClip, type StudioEffects, type StudioFade, type StudioProject, type StudioTrack } from '@ton/core';

const MAX_TRACKS = 512;
const MAX_CLIPS = 4096;
const CURVES: Record<string, true> = { linear: true, 'equal-power': true, exponential: true };

const fail = (message: string): never => { throw new Error('Invalid Studio project: ' + message); };
const number = (value: unknown, name: string, min = -Infinity, max = Infinity): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${name} must be a number in ${min}..${max}`);
  return value as number;
};
const text = (value: unknown, name: string): string => (typeof value === 'string' && value.length <= 4096 ? value : fail(name + ' must be text'));

function fade(value: unknown, name: string): StudioFade {
  const raw = value as Partial<StudioFade> | null;
  if (!raw || typeof raw !== 'object') fail(name + ' missing');
  const curve = (raw as StudioFade).curve;
  if (typeof curve !== 'string' || CURVES[curve] !== true) fail(name + ' has an unknown curve');
  return { seconds: number((raw as StudioFade).seconds, name + '.seconds', 0, 3600), curve };
}

function effects(value: unknown): StudioEffects {
  const raw = value as Partial<StudioEffects> | null;
  if (!raw || typeof raw !== 'object') return fail('effects missing');
  const result: StudioEffects = {
    bassDb: number(raw.bassDb, 'bassDb', -STUDIO_MAX_TONE_DB, STUDIO_MAX_TONE_DB),
    trebleDb: number(raw.trebleDb, 'trebleDb', -STUDIO_MAX_TONE_DB, STUDIO_MAX_TONE_DB),
    pan: number(raw.pan, 'pan', -1, 1),
    reverb: null,
    echo: null,
    filter: null,
  };
  if (raw.reverb) result.reverb = { mix: number(raw.reverb.mix, 'reverb.mix', 0, 1), size: number(raw.reverb.size, 'reverb.size', 0, 1), damping: number(raw.reverb.damping, 'reverb.damping', 0, 1) };
  if (raw.echo) result.echo = { mix: number(raw.echo.mix, 'echo.mix', 0, 1), seconds: number(raw.echo.seconds, 'echo.seconds', 0.02, 2), feedback: number(raw.echo.feedback, 'echo.feedback', 0, 0.95) };
  if (raw.filter) {
    if (raw.filter.type !== 'lowpass' && raw.filter.type !== 'highpass') fail('filter.type');
    result.filter = { type: raw.filter.type, hz: number(raw.filter.hz, 'filter.hz', 20, 20000) };
  }
  return result;
}

function clip(value: unknown): StudioClip {
  const raw = value as Partial<StudioClip> | null;
  if (!raw || typeof raw !== 'object') return fail('clip missing');
  const inSec = number(raw.inSec, 'inSec', 0);
  const outSec = number(raw.outSec, 'outSec', 0);
  if (outSec <= inSec) fail('clip window is empty');
  return {
    id: text(raw.id, 'clip.id'),
    assetId: text(raw.assetId, 'clip.assetId'),
    startSec: number(raw.startSec, 'startSec', 0, 86400),
    inSec,
    outSec,
    speed: number(raw.speed, 'speed', 0.25, 4),
    pitchLock: typeof raw.pitchLock === 'boolean' ? raw.pitchLock : fail('pitchLock'),
    semitones: number(raw.semitones, 'semitones', -24, 24),
    reverse: typeof raw.reverse === 'boolean' ? raw.reverse : fail('reverse'),
    gainDb: number(raw.gainDb, 'gainDb', -60, 24),
    fadeIn: fade(raw.fadeIn, 'fadeIn'),
    fadeOut: fade(raw.fadeOut, 'fadeOut'),
  };
}

/** Rebuilds the project from only the fields and ranges the renderer is allowed to send. */
export function parseStudioProject(value: unknown): StudioProject {
  const raw = value as Partial<StudioProject> | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tracks) || !raw.assets || typeof raw.assets !== 'object') return fail('shape');
  if (raw.tracks.length > MAX_TRACKS) fail('too many tracks');
  let clipCount = 0;
  const tracks: StudioTrack[] = raw.tracks.map((track) => {
    const source = track as Partial<StudioTrack>;
    if (!Array.isArray(source.clips)) return fail('track.clips');
    clipCount += source.clips.length;
    if (clipCount > MAX_CLIPS) fail('too many clips');
    return {
      id: text(source.id, 'track.id'),
      clips: source.clips.map(clip),
      volume: number(source.volume, 'volume', 0, STUDIO_MAX_VOLUME),
      muted: source.muted === true,
      solo: source.solo === true,
      effects: effects(source.effects),
    };
  });
  const assets: StudioProject['assets'] = {};
  for (const [id, entry] of Object.entries(raw.assets)) {
    const asset = entry as Partial<StudioProject['assets'][string]>;
    const location = text(asset.path, 'asset.path');
    assets[id] = {
      id,
      path: location,
      title: text(asset.title ?? '', 'asset.title'),
      artist: text(asset.artist ?? '', 'asset.artist'),
      durationSec: number(asset.durationSec, 'asset.durationSec', 0, 86400),
      bpm: null,
      key: null,
      coverPath: null,
      temporary: asset.temporary === true,
    };
  }
  return { tracks, assets, gridBpm: null, masterGainDb: number(raw.masterGainDb ?? 0, 'masterGainDb', -24, 12) };
}

/** Every file the project plays must be an absolute path to an existing audio file. */
export async function assertAssetsReadable(project: StudioProject): Promise<void> {
  const used = new Set<string>();
  for (const track of project.tracks) for (const item of track.clips) used.add(item.assetId);
  for (const id of used) {
    const asset = project.assets[id];
    if (!asset) fail('clip refers to missing asset ' + id);
    if (!path.isAbsolute(asset.path)) fail('asset path must be absolute');
    if (!(SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(path.extname(asset.path).toLowerCase())) fail('unsupported audio file type');
    await fs.promises.access(asset.path, fs.constants.R_OK).catch(() => fail('audio file is not readable: ' + path.basename(asset.path)));
  }
}
