import { decimate } from './audio-utils';

export interface BpmEstimate {
  bpm: number;
  /** 0..1, how much the best tempo stands out from the rest. */
  confidence: number;
}

const ANALYSIS_RATE = 11025;
const HOP = 64;
const MIN_BPM = 70;
const MAX_BPM = 180;

/**
 * Tempo from the onset-strength envelope: log-energy rise per short hop, autocorrelated over the lag range, scored with
 * a small comb of multiples so half/double time folds into one range. Pure TypeScript, no dependency.
 */
export function detectBpm(mono: Float32Array, sampleRate: number): BpmEstimate | null {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const samples = decimate(mono, factor);
  const rate = sampleRate / factor;
  const frames = Math.floor(samples.length / HOP);
  if (frames < (rate / HOP) * 8) return null;

  const energy = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    const base = frame * HOP;
    for (let index = 0; index < HOP; index += 1) sum += samples[base + index] * samples[base + index];
    energy[frame] = Math.log1p(sum * 1000);
  }
  const onset = new Float64Array(frames);
  for (let frame = 1; frame < frames; frame += 1) onset[frame] = Math.max(0, energy[frame] - energy[frame - 1]);
  removeLocalMean(onset, Math.round((rate / HOP) * 0.5));

  const fps = rate / HOP;
  const minLag = Math.floor((60 / MAX_BPM) * fps);
  const maxLag = Math.ceil((60 / MIN_BPM) * fps);
  const acf = new Float64Array(maxLag * 4 + 2);
  const lagLimit = Math.min(acf.length - 1, Math.floor(frames / 2));
  for (let lag = minLag; lag <= lagLimit; lag += 1) {
    let sum = 0;
    for (let frame = lag; frame < frames; frame += 1) sum += onset[frame] * onset[frame - lag];
    acf[lag] = sum / (frames - lag);
  }

  let bestLag = -1;
  let bestScore = 0;
  let total = 0;
  let count = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = acf[lag] + 0.5 * (acf[lag * 2] ?? 0) + 0.25 * (acf[lag * 4] ?? 0);
    total += Math.max(0, score);
    count += 1;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestScore <= 0) return null;

  // Parabolic interpolation around the integer lag gives sub-frame precision.
  const left = acf[bestLag - 1] ?? 0;
  const mid = acf[bestLag];
  const right = acf[bestLag + 1] ?? 0;
  const denominator = left - 2 * mid + right;
  const shift = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));

  const mean = total / Math.max(1, count);
  const confidence = Math.max(0, Math.min(1, 1 - mean / bestScore));
  return { bpm: Math.round((60 * fps / lag) * 10) / 10, confidence };
}

function removeLocalMean(values: Float64Array, radius: number): void {
  const copy = Float64Array.from(values);
  let running = 0;
  const size = Math.max(1, radius * 2 + 1);
  for (let index = 0; index < copy.length; index += 1) {
    running += copy[index];
    if (index >= size) running -= copy[index - size];
    const windowSize = Math.min(size, index + 1);
    values[index] = Math.max(0, copy[index] - running / windowSize);
  }
}
