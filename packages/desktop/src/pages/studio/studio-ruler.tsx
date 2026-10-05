import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { secondsPerBeat } from '@ton/core';
import { RULER_HEIGHT } from './studio-geometry';
import { formatClock } from './studio-format';

const SECOND_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const BAR_STEPS = [1, 2, 4, 8, 16, 32, 64, 128];

interface Props {
  pxPerSec: number;
  gridBpm: number | null;
  viewLeft: number;
  viewWidth: number;
  totalWidth: number;
  onSeek: (sec: number) => void;
}

/** Bars and beats when a tempo is known, plain seconds otherwise. Painted only for the visible slice. */
export function StudioRuler({ pxPerSec, gridBpm, viewLeft, viewWidth, totalWidth, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.max(0, Math.ceil(Math.min(viewWidth, totalWidth - viewLeft)));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || width <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(RULER_HEIGHT * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${RULER_HEIGHT}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, RULER_HEIGHT);
    context.font = '10px Outfit, sans-serif';
    context.textBaseline = 'top';
    const startSec = viewLeft / pxPerSec;
    const endSec = (viewLeft + width) / pxPerSec;
    const line = (x: number, tall: boolean, strong: boolean) => {
      context.fillStyle = strong ? 'rgba(232,232,232,0.55)' : 'rgba(138,138,138,0.35)';
      context.fillRect(Math.round(x), tall ? 14 : 21, 1, tall ? 16 : 9);
    };
    if (gridBpm) {
      const beat = secondsPerBeat(gridBpm);
      const bar = beat * 4;
      const barStep = BAR_STEPS.find((step) => step * bar * pxPerSec >= 56) ?? BAR_STEPS[BAR_STEPS.length - 1];
      if (beat * pxPerSec >= 9) {
        for (let index = Math.floor(startSec / beat); index * beat <= endSec; index += 1) {
          if (index % 4 !== 0) line(index * beat * pxPerSec - viewLeft, false, false);
        }
      }
      for (let index = Math.floor(startSec / bar / barStep) * barStep; index * bar <= endSec; index += barStep) {
        const x = index * bar * pxPerSec - viewLeft;
        line(x, true, true);
        context.fillStyle = 'rgba(160,160,160,0.9)';
        context.fillText(String(index + 1), x + 4, 3);
      }
    } else {
      const step = SECOND_STEPS.find((candidate) => candidate * pxPerSec >= 70) ?? SECOND_STEPS[SECOND_STEPS.length - 1];
      for (let second = Math.floor(startSec / step) * step; second <= endSec; second += step) {
        const x = second * pxPerSec - viewLeft;
        line(x, true, true);
        context.fillStyle = 'rgba(160,160,160,0.9)';
        context.fillText(formatClock(second), x + 4, 3);
      }
    }
  }, [pxPerSec, gridBpm, viewLeft, width]);

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, (event.clientX - bounds.left) / pxPerSec));
  };

  return (
    <div
      className="studio-ruler"
      style={{ width: totalWidth, height: RULER_HEIGHT }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
      }}
    >
      <canvas ref={canvasRef} style={{ left: viewLeft }} />
    </div>
  );
}
