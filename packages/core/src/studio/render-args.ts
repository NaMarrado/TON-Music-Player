import { fadeGainExpression } from './curves';
import { reverbDecaySeconds, reverbDryGain, reverbImpulseKey } from './reverb';
import { audibleTracks, clipDurationSec, clipEndSec, clipPitchRatio } from './timeline';
import type { StudioAsset, StudioClip, StudioProject, StudioTrack } from './types';
import { STUDIO_SAMPLE_RATE } from './types';

export interface RenderOptions {
  output: { path: string; format: 'm4a' | 'wav' };
  /** Render only this part of the timeline (used for fast previews). Default: everything plus effect tails. */
  range?: { startSec: number; endSec: number };
  /** Location of the generated impulse-response WAV for each `reverbImpulseKey`. */
  impulsePaths?: Record<string, string>;
  /** Write the filter graph to this file (`-filter_complex_script`) instead of passing it inline. */
  filterScriptPath?: string;
  sampleRate?: number;
  bitrate?: string;
  metadata?: { title?: string; artist?: string };
}

export interface RenderPlan {
  args: string[];
  /** Text to write to `filterScriptPath` when that option is used. */
  filterGraph: string;
  durationSec: number;
  clipCount: number;
}

interface CroppedClip {
  clip: StudioClip;
  asset: StudioAsset;
  startRel: number;
  inSec: number;
  outSec: number;
  /** How far into the clip's own timeline the crop starts. */
  cropOffsetSec: number;
  fullDurationSec: number;
}

const num = (value: number): string => String(Number(value.toFixed(6)));

const LIMITER_ATTACK_MS = 5;

/** Samples the master limiter delays its output by: floor(attack * rate / 1000) - 1, measured on the shipped ffmpeg 6.0. */
export function limiterLatencySamples(sampleRate: number): number {
  return Math.max(0, Math.floor((LIMITER_ATTACK_MS * sampleRate) / 1000) - 1);
}

/** Reverb impulse keys the render needs, so the caller can write those WAV files first. */
export function requiredImpulseKeys(project: StudioProject): string[] {
  const keys: Record<string, true> = {};
  for (const track of audibleTracks(project)) {
    if (track.effects.reverb && track.effects.reverb.mix > 0) keys[reverbImpulseKey(track.effects.reverb)] = true;
  }
  return Object.keys(keys);
}

/** Extra time after the last clip so reverb and echo tails are not cut off. */
export function effectTailSeconds(project: StudioProject): number {
  let tail = 0;
  for (const track of audibleTracks(project)) {
    if (track.effects.reverb && track.effects.reverb.mix > 0) tail = Math.max(tail, reverbDecaySeconds(track.effects.reverb.size));
    if (track.effects.echo && track.effects.echo.mix > 0) tail = Math.max(tail, Math.min(4, track.effects.echo.seconds * 3));
  }
  return Math.min(4, tail);
}

export function buildRenderArgs(project: StudioProject, options: RenderOptions): RenderPlan | null {
  const sampleRate = options.sampleRate ?? STUDIO_SAMPLE_RATE;
  const tracks = audibleTracks(project);
  let contentEnd = 0;
  for (const track of tracks) for (const clip of track.clips) contentEnd = Math.max(contentEnd, clipEndSec(clip));
  const rangeStart = options.range?.startSec ?? 0;
  const rangeEnd = options.range ? Math.min(options.range.endSec, contentEnd) : contentEnd;
  if (!(rangeEnd > rangeStart)) return null;
  const durationSec = rangeEnd - rangeStart + (options.range ? 0 : effectTailSeconds(project));

  const inputArgs: string[] = [];
  const graph: string[] = [];
  let inputCount = 0;
  let clipCount = 0;
  const trackLabels: string[] = [];

  tracks.forEach((track, trackIndex) => {
    const clipLabels: string[] = [];
    for (const cropped of cropClips(project, track, rangeStart, rangeEnd)) {
      const input = inputCount;
      inputCount += 1;
      clipCount += 1;
      inputArgs.push('-ss', num(cropped.inSec), '-t', num(cropped.outSec - cropped.inSec + (cropped.clip.reverse ? 0 : 0.05)), '-i', cropped.asset.path);
      const label = `c${input}`;
      graph.push(`[${input}:a]${clipFilters(cropped, sampleRate, durationSec + limiterLatencySamples(sampleRate) / sampleRate)}[${label}]`);
      clipLabels.push(`[${label}]`);
    }
    if (clipLabels.length === 0) return;
    let bus = clipLabels[0];
    if (clipLabels.length > 1) {
      graph.push(`${clipLabels.join('')}amix=inputs=${clipLabels.length}:duration=longest:dropout_transition=0,volume=${clipLabels.length}[tb${trackIndex}]`);
      bus = `[tb${trackIndex}]`;
    }
    const chain = trackEffectFilters(track);
    const reverb = track.effects.reverb && track.effects.reverb.mix > 0 ? track.effects.reverb : null;
    let current = bus;
    if (chain.length > 0) {
      graph.push(`${current}${chain.join(',')}[te${trackIndex}]`);
      current = `[te${trackIndex}]`;
    }
    if (reverb) {
      const impulsePath = options.impulsePaths?.[reverbImpulseKey(reverb)];
      if (!impulsePath) throw new Error('Missing reverb impulse file for ' + reverbImpulseKey(reverb));
      const impulseInput = inputCount;
      inputCount += 1;
      inputArgs.push('-i', impulsePath);
      graph.push(`${current}[${impulseInput}:a]afir=dry=${num(reverbDryGain(reverb.mix))}:wet=${num(reverb.mix)}:gtype=none:irgain=1[tr${trackIndex}]`);
      current = `[tr${trackIndex}]`;
    }
    const after = trackOutputFilters(track);
    if (after.length > 0) {
      graph.push(`${current}${after.join(',')}[tf${trackIndex}]`);
      current = `[tf${trackIndex}]`;
    }
    trackLabels.push(current);
  });

  if (trackLabels.length === 0) return null;
  const masterGain = 10 ** (project.masterGainDb / 20);
  // alimiter delays its output by its attack (lookahead); cut exactly that many samples off the head to stay on the timeline.
  const limiter = `alimiter=limit=0.95:attack=${LIMITER_ATTACK_MS}:level=disabled,atrim=start_sample=${limiterLatencySamples(sampleRate)},asetpts=PTS-STARTPTS`;
  if (trackLabels.length === 1) {
    graph.push(`${trackLabels[0]}volume=${num(masterGain)},${limiter}[out]`);
  } else {
    graph.push(`${trackLabels.join('')}amix=inputs=${trackLabels.length}:duration=longest:dropout_transition=0,volume=${num(trackLabels.length * masterGain)},${limiter}[out]`);
  }

  const filterGraph = graph.join(';\n');
  const args = ['-hide_banner', '-nostdin', '-y', ...inputArgs];
  if (options.filterScriptPath) args.push('-filter_complex_script', options.filterScriptPath);
  else args.push('-filter_complex', filterGraph.replace(/;\n/g, ';'));
  args.push('-map', '[out]', '-vn', '-map_metadata', '-1', '-t', num(durationSec), '-ar', String(sampleRate));
  if (options.metadata?.title) args.push('-metadata', `title=${options.metadata.title}`);
  if (options.metadata?.artist) args.push('-metadata', `artist=${options.metadata.artist}`);
  if (options.output.format === 'wav') args.push('-c:a', 'pcm_s16le');
  else args.push('-c:a', 'aac', '-b:a', options.bitrate ?? '256k', '-movflags', '+faststart');
  args.push('-progress', 'pipe:1', options.output.path);
  return { args, filterGraph, durationSec, clipCount };
}

function cropClips(project: StudioProject, track: StudioTrack, rangeStart: number, rangeEnd: number): CroppedClip[] {
  const result: CroppedClip[] = [];
  for (const clip of track.clips) {
    const asset = project.assets[clip.assetId];
    if (!asset) continue;
    const start = clip.startSec;
    const end = clipEndSec(clip);
    if (end <= rangeStart || start >= rangeEnd) continue;
    const from = Math.max(start, rangeStart);
    const to = Math.min(end, rangeEnd);
    const head = (from - start) * clip.speed;
    const length = (to - from) * clip.speed;
    const inSec = clip.reverse ? clip.outSec - head - length : clip.inSec + head;
    result.push({
      clip,
      asset,
      startRel: from - rangeStart,
      inSec,
      outSec: inSec + length,
      cropOffsetSec: from - start,
      fullDurationSec: clipDurationSec(clip),
    });
  }
  return result;
}

function clipFilters(cropped: CroppedClip, sampleRate: number, totalSec: number): string {
  const { clip, startRel } = cropped;
  const parts = [`aresample=${sampleRate}`, 'aformat=sample_fmts=fltp:channel_layouts=stereo'];
  if (clip.reverse) parts.push('areverse');
  const pitch = clipPitchRatio(clip);
  if (Math.abs(pitch - 1) > 1e-6) parts.push(`asetrate=${Math.round(sampleRate * pitch)}`, `aresample=${sampleRate}`);
  let tempo = clip.speed / pitch;
  // atempo only accepts 0.5..100 per stage, so slow-downs are chained.
  while (tempo < 0.5 - 1e-9) {
    parts.push('atempo=0.5');
    tempo /= 0.5;
  }
  if (Math.abs(tempo - 1) > 1e-6) parts.push(`atempo=${num(tempo)}`);
  parts.push(`atrim=duration=${num((cropped.outSec - cropped.inSec) / clip.speed)}`, 'asetpts=PTS-STARTPTS');
  const envelope = gainEnvelope(cropped);
  if (envelope) parts.push('asetnsamples=n=64:p=0', `volume='${envelope}':eval=frame`);
  if (startRel > 0) {
    const samples = Math.round(startRel * sampleRate);
    parts.push(`adelay=${samples}S|${samples}S`);
  }
  parts.push(`apad=whole_dur=${num(totalSec)}`);
  return parts.join(',');
}

/** Clip gain plus fades as one expression of time, valid even when the clip was cropped inside a fade. */
function gainEnvelope(cropped: CroppedClip): string | null {
  const { clip, cropOffsetSec, fullDurationSec } = cropped;
  const base = 10 ** (clip.gainDb / 20);
  const factors: string[] = [];
  if (Math.abs(base - 1) > 1e-6) factors.push(num(base));
  const clipTime = `(t+${num(cropOffsetSec)})`;
  if (clip.fadeIn.seconds > 0) {
    const seconds = num(clip.fadeIn.seconds);
    factors.push(fadeGainExpression(clip.fadeIn.curve, `clip(${clipTime}/${seconds},0,1)`));
  }
  if (clip.fadeOut.seconds > 0) {
    const seconds = num(clip.fadeOut.seconds);
    factors.push(fadeGainExpression(clip.fadeOut.curve, `clip((${num(fullDurationSec)}-${clipTime})/${seconds},0,1)`));
  }
  return factors.length > 0 ? factors.join('*') : null;
}

/** Filters before the reverb: tone shaping and echo. */
function trackEffectFilters(track: StudioTrack): string[] {
  const { effects } = track;
  const filters: string[] = [];
  if (effects.filter) filters.push(`${effects.filter.type}=f=${num(effects.filter.hz)}`);
  if (effects.bassDb !== 0) filters.push(`bass=g=${num(effects.bassDb)}:f=100`);
  if (effects.trebleDb !== 0) filters.push(`treble=g=${num(effects.trebleDb)}:f=8000`);
  if (effects.echo && effects.echo.mix > 0) {
    const delay = Math.round(effects.echo.seconds * 1000);
    const first = effects.echo.mix;
    const second = effects.echo.mix * effects.echo.feedback;
    filters.push(`aecho=in_gain=1:out_gain=1:delays=${delay}|${delay * 2}:decays=${num(first)}|${num(second)}`);
  }
  return filters;
}

/** Filters after the reverb: pan and track volume. */
function trackOutputFilters(track: StudioTrack): string[] {
  const filters: string[] = [];
  const { pan } = track.effects;
  if (pan !== 0) filters.push(`pan=stereo|c0=${num(Math.min(1, 1 - pan))}*c0|c1=${num(Math.min(1, 1 + pan))}*c1`);
  if (track.volume !== 1) filters.push(`volume=${num(track.volume)}`);
  return filters;
}
