import { decimate } from './audio-utils';
import { createFftPlan, fft, hannWindow } from './fft';

export interface KeyEstimate {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  mode: 'major' | 'minor';
  /** Camelot notation such as "8A" (A minor) or "8B" (C major). */
  camelot: string;
  /** 0..1, margin between the best and the second-best key. */
  confidence: number;
}

// Krumhansl-Kessler probe-tone profiles (Krumhansl & Schmuckler key finding).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Camelot number for each tonic pitch class (C, C#, D, ...), major = B ring, minor = A ring.
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

const ANALYSIS_RATE = 11025;
const FRAME = 8192;
const HOP = 4096;
const MIN_HZ = 60;
const MAX_HZ = 2000;

export function camelotFor(tonic: number, mode: 'major' | 'minor'): string {
  const wheel = mode === 'major' ? CAMELOT_MAJOR : CAMELOT_MINOR;
  return `${wheel[((tonic % 12) + 12) % 12]}${mode === 'major' ? 'B' : 'A'}`;
}

/** Pitch-class energy (chroma) summed over the whole signal, normalised to sum 1. */
export function computeChroma(mono: Float32Array, sampleRate: number): Float64Array {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE));
  const samples = decimate(mono, factor);
  const rate = sampleRate / factor;
  const plan = createFftPlan(FRAME);
  const window = hannWindow(FRAME);
  const real = new Float64Array(FRAME);
  const imag = new Float64Array(FRAME);
  const chroma = new Float64Array(12);
  const binPitchClass = new Int8Array(FRAME / 2).fill(-1);
  for (let bin = 1; bin < FRAME / 2; bin += 1) {
    const hz = (bin * rate) / FRAME;
    if (hz < MIN_HZ || hz > MAX_HZ) continue;
    binPitchClass[bin] = ((Math.round(12 * Math.log2(hz / 440)) + 9) % 12 + 12) % 12;
  }
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    for (let index = 0; index < FRAME; index += 1) {
      real[index] = samples[start + index] * window[index];
      imag[index] = 0;
    }
    fft(plan, real, imag);
    for (let bin = 1; bin < FRAME / 2; bin += 1) {
      const pitchClass = binPitchClass[bin];
      if (pitchClass < 0) continue;
      // Square-root compression keeps one loud partial from outvoting the rest of the chord.
      chroma[pitchClass] += Math.sqrt(Math.hypot(real[bin], imag[bin]));
    }
  }
  let total = 0;
  for (const value of chroma) total += value;
  if (total > 0) for (let index = 0; index < 12; index += 1) chroma[index] /= total;
  return chroma;
}

export function keyFromChroma(chroma: ArrayLike<number>): KeyEstimate | null {
  let total = 0;
  for (let index = 0; index < 12; index += 1) total += chroma[index];
  if (!(total > 0)) return null;
  const scores: { tonic: number; mode: 'major' | 'minor'; score: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const rotated = (profile: number[]) => Array.from({ length: 12 }, (_, pitch) => profile[(pitch - tonic + 12) % 12]);
    scores.push({ tonic, mode: 'major', score: correlation(chroma, rotated(MAJOR_PROFILE)) });
    scores.push({ tonic, mode: 'minor', score: correlation(chroma, rotated(MINOR_PROFILE)) });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];
  return {
    tonic: best.tonic,
    mode: best.mode,
    camelot: camelotFor(best.tonic, best.mode),
    confidence: Math.max(0, Math.min(1, (best.score - second.score) * 4)),
  };
}

export function detectKey(mono: Float32Array, sampleRate: number): KeyEstimate | null {
  if (mono.length < sampleRate * 3) return null;
  return keyFromChroma(computeChroma(mono, sampleRate));
}

function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < 12; index += 1) { meanA += a[index]; meanB += b[index]; }
  meanA /= 12;
  meanB /= 12;
  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  for (let index = 0; index < 12; index += 1) {
    const x = a[index] - meanA;
    const y = b[index] - meanB;
    numerator += x * y;
    denominatorA += x * x;
    denominatorB += y * y;
  }
  const denominator = Math.sqrt(denominatorA * denominatorB);
  return denominator === 0 ? 0 : numerator / denominator;
}
