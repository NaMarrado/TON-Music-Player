import { memo, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { StudioClip } from '@ton/core';
import { STUDIO_COLORS } from './studio-ui';

const MAX_COLUMNS = 400;

interface Props {
  clip: StudioClip;
  assetDurationSec: number;
  peaks: Float32Array | undefined;
  width: number;
  height: number;
  /** Changes when new waveform data arrived for the asset. */
  revision: number;
}

/** One path for the whole waveform keeps a lane to a single native view, however long the clip is. */
function WaveformView({ clip, assetDurationSec, peaks, width, height, revision }: Props) {
  const outer = useMemo(() => {
    if (!peaks || peaks.length === 0 || assetDurationSec <= 0 || width < 2) return '';
    const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.floor(width / 2)));
    const step = width / columns;
    const bucketsPerSec = peaks.length / assetDurationSec;
    const clipSec = (clip.outSec - clip.inSec) / clip.speed;
    const middle = height / 2;
    const half = height * 0.42;
    let path = '';
    for (let column = 0; column < columns; column += 1) {
      const a = (column / columns) * clipSec;
      const b = ((column + 1) / columns) * clipSec;
      const sourceA = clip.reverse ? clip.outSec - a * clip.speed : clip.inSec + a * clip.speed;
      const sourceB = clip.reverse ? clip.outSec - b * clip.speed : clip.inSec + b * clip.speed;
      const from = Math.max(0, Math.floor(Math.min(sourceA, sourceB) * bucketsPerSec));
      const to = Math.min(peaks.length - 1, Math.max(from, Math.ceil(Math.max(sourceA, sourceB) * bucketsPerSec)));
      let peak = 0;
      for (let index = from; index <= to; index += 1) if (peaks[index] > peak) peak = peaks[index];
      const amplitude = Math.max(1, Math.pow(peak, 0.8) * half);
      const x = (column * step + step / 2).toFixed(1);
      path += `M${x} ${(middle - amplitude).toFixed(1)}V${(middle + amplitude).toFixed(1)}`;
    }
    return path;
    // `revision` is part of the key: the peaks array is replaced outside React state.
  }, [peaks, revision, assetDurationSec, clip.inSec, clip.outSec, clip.speed, clip.reverse, width, height]);

  if (!outer) return null;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Path d={outer} stroke={STUDIO_COLORS.wave} strokeWidth={Math.max(1, (width / Math.min(MAX_COLUMNS, Math.floor(width / 2))) * 0.7)} />
    </Svg>
  );
}

export const Waveform = memo(WaveformView);
