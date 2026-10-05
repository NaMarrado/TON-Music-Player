/**
 * Wide ranges (volume up to 500 %, bass ±40 dB, speed 0.25-4×) stay easy to set because the slider is finer near the
 * neutral value and coarser towards the ends: the slider position runs from -1 to 1 with the neutral value in the middle,
 * and each half covers its side of the range along a square curve.
 */
export function sliderPositionOf(value: number, min: number, max: number, neutral: number): number {
  if (value >= neutral) return max > neutral ? Math.sqrt(Math.min(1, (value - neutral) / (max - neutral))) : 0;
  return neutral > min ? -Math.sqrt(Math.min(1, (neutral - value) / (neutral - min))) : 0;
}

/** The value at a slider position from -1 to 1, rounded to `step`. */
export function sliderValueAt(position: number, min: number, max: number, neutral: number, step: number): number {
  const share = Math.min(1, Math.abs(position)) ** 2;
  const raw = position >= 0 ? neutral + share * (max - neutral) : neutral - share * (neutral - min);
  return Math.min(max, Math.max(min, Math.round(raw / step) * step));
}
