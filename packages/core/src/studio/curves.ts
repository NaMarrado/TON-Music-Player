import type { StudioFadeCurve } from './types';

/** Gain of a fade-in at progress x in 0..1. A fade-out at progress x is `fadeInGain(curve, 1 - x)`. */
export function fadeInGain(curve: StudioFadeCurve, progress: number): number {
  const x = Math.min(1, Math.max(0, progress));
  switch (curve) {
    case 'linear':
      return x;
    case 'equal-power':
      // sin/cos pair: sin^2 + cos^2 = 1, so a crossfade keeps constant power.
      return Math.sin((x * Math.PI) / 2);
    case 'exponential':
      return x * x;
  }
}

export function fadeOutGain(curve: StudioFadeCurve, progress: number): number {
  return fadeInGain(curve, 1 - progress);
}

/** Samples of a rising fade for `AudioParam.setValueCurveAtTime`. */
export function sampleFadeCurve(curve: StudioFadeCurve, points: number, rising: boolean): Float32Array {
  const count = Math.max(2, Math.floor(points));
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const x = index / (count - 1);
    values[index] = rising ? fadeInGain(curve, x) : fadeOutGain(curve, x);
  }
  return values;
}

/**
 * ffmpeg expression for a fade gain, using `x` as the progress expression (0..1, already clipped by the caller).
 * Written as an expression instead of `afade` so a clip cropped in the middle of a fade keeps the right gain.
 */
export function fadeGainExpression(curve: StudioFadeCurve, progressExpression: string): string {
  switch (curve) {
    case 'linear':
      return `(${progressExpression})`;
    case 'equal-power':
      return `sin(PI/2*(${progressExpression}))`;
    case 'exponential':
      return `pow(${progressExpression},2)`;
  }
}
