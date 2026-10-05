import type { StudioClip } from '@ton/core';

export interface WaveformPaint {
  context: CanvasRenderingContext2D;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  clip: StudioClip;
  assetDurationSec: number;
  /** Coarse-to-fine peak levels of the whole asset. */
  peaks: Float32Array[];
  pxPerSec: number;
  /** Clip-local x position (CSS px) of the canvas' left edge, so only the visible slice is painted. */
  originPx: number;
}

const OUTER = 'rgba(232, 137, 43, 0.95)';
const CORE = 'rgba(244, 228, 196, 0.95)';

/** Picks the coarsest level that still has about one bucket per drawn pixel. */
function chooseLevel(peaks: Float32Array[], durationSec: number, sourceSecPerPx: number): Float32Array {
  for (const level of peaks) {
    if ((level.length / durationSec) * sourceSecPerPx >= 1) return level;
  }
  return peaks[peaks.length - 1];
}

export function paintWaveform(paint: WaveformPaint): void {
  const { context, width, height, clip, assetDurationSec, peaks, pxPerSec, originPx } = paint;
  context.clearRect(0, 0, width, height);
  if (peaks.length === 0 || assetDurationSec <= 0) return;
  const level = chooseLevel(peaks, assetDurationSec, clip.speed / pxPerSec);
  const bucketsPerSec = level.length / assetDurationSec;
  const middle = height / 2;
  const halfMax = height * 0.44;
  const sourceAt = (clipSeconds: number) => (clip.reverse ? clip.outSec - clipSeconds * clip.speed : clip.inSec + clipSeconds * clip.speed);
  for (let x = 0; x < width; x += 1) {
    const a = sourceAt((originPx + x) / pxPerSec);
    const b = sourceAt((originPx + x + 1) / pxPerSec);
    const from = Math.max(0, Math.floor(Math.min(a, b) * bucketsPerSec));
    const to = Math.min(level.length - 1, Math.max(from, Math.ceil(Math.max(a, b) * bucketsPerSec)));
    let peak = 0;
    for (let index = from; index <= to; index += 1) if (level[index] > peak) peak = level[index];
    if (peak <= 0) continue;
    const amplitude = Math.max(1, Math.pow(peak, 0.8) * halfMax);
    context.fillStyle = OUTER;
    context.fillRect(x, middle - amplitude, 1, amplitude * 2);
    context.fillStyle = CORE;
    context.fillRect(x, middle - amplitude * 0.55, 1, amplitude * 1.1);
  }
}
