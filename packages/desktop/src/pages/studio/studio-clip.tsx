import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clipDurationSec,
  fadeInGain,
  fadeOutGain,
  findClip,
  moveClip,
  trimClipEnd,
  trimClipStart,
  updateClip,
  type StudioAsset,
  type StudioClip,
  type StudioFade,
} from '@ton/core';
import { editProject, selectClip, useStudioStore } from './studio-store';
import { studioEngine } from './studio-engine';
import { laneIdAt, snapTime, LANE_HEIGHT } from './studio-geometry';
import { paintWaveform } from './studio-waveform';

const EDGE_PX = 7;
const FADE_POINTS = 28;

function fadePath(fade: StudioFade, widthPx: number, height: number, rising: boolean): string {
  if (fade.seconds <= 0 || widthPx <= 0) return '';
  const points: string[] = [];
  for (let index = 0; index <= FADE_POINTS; index += 1) {
    const progress = index / FADE_POINTS;
    const gain = rising ? fadeInGain(fade.curve, progress) : fadeOutGain(fade.curve, progress);
    points.push(`${(progress * widthPx).toFixed(1)},${(height - gain * (height - 6) - 3).toFixed(1)}`);
  }
  return points.join(' ');
}

interface Props {
  clip: StudioClip;
  asset: StudioAsset;
  trackId: string;
  selected: boolean;
  pxPerSec: number;
  /** Scroll position and viewport width in pixels, used to paint only the visible part of long clips. */
  viewLeft: number;
  viewWidth: number;
  laneOffsetPx: number;
}

type DragMode = 'move' | 'trim-start' | 'trim-end' | 'fade-in' | 'fade-out';

function StudioClipView({ clip, asset, trackId, selected, pxPerSec, viewLeft, viewWidth, laneOffsetPx }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRevision = useStudioStore((state) => state.peaksRevision);
  const duration = clipDurationSec(clip);
  const clipWidth = Math.max(2, duration * pxPerSec);
  const clipLeft = clip.startSec * pxPerSec;

  // Only the part of the clip inside the viewport (plus a margin) is painted, so a long clip at high zoom never needs a huge canvas.
  const visibleStart = Math.max(0, viewLeft - laneOffsetPx - clipLeft - 200);
  const visibleEnd = Math.min(clipWidth, viewLeft + viewWidth - laneOffsetPx - clipLeft + 200);
  const paintWidth = Math.max(0, Math.ceil(visibleEnd - visibleStart));

  useEffect(() => {
    const canvas = canvasRef.current;
    const peaks = studioEngine.getPeaks(asset.id);
    if (!canvas || !peaks || paintWidth <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    const height = LANE_HEIGHT - 12;
    canvas.width = Math.ceil(paintWidth * ratio);
    canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${paintWidth}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintWaveform({ context, width: paintWidth, height, clip, assetDurationSec: asset.durationSec, peaks, pxPerSec, originPx: Math.floor(visibleStart) });
  }, [clip, asset.id, asset.durationSec, pxPerSec, paintWidth, visibleStart, peaksRevision]);

  const begin = (event: ReactPointerEvent<HTMLElement>, mode: DragMode) => {
    event.stopPropagation();
    event.preventDefault();
    selectClip(clip.id);
    const element = event.currentTarget.closest('.studio-clip');
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const startX = event.clientX;
    const origStart = clip.startSec;
    const origEnd = clip.startSec + duration;
    const clipId = clip.id;
    const pointerId = event.pointerId;
    let laneId = trackId;

    // Listeners live on the window, not on the clip: moving a clip to another lane re-mounts it, and the drag must go on.
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const state = useStudioStore.getState();
      const delta = (moveEvent.clientX - startX) / state.pxPerSec;
      const snap = (time: number) => snapTime(time, state.project, state.snapBeats, moveEvent.altKey);
      switch (mode) {
        case 'move': {
          laneId = laneIdAt(moveEvent.clientX, moveEvent.clientY) ?? laneId;
          editProject((project) => moveClip(project, clipId, snap(origStart + delta), laneId), `move:${clipId}`);
          break;
        }
        case 'trim-start':
          editProject((project) => trimClipStart(project, clipId, snap(origStart + delta)), `trim:${clipId}`);
          break;
        case 'trim-end':
          editProject((project) => trimClipEnd(project, clipId, snap(origEnd + delta)), `trim:${clipId}`);
          break;
        case 'fade-in':
          editProject((project) => updateClip(project, clipId, { fadeIn: { curve: findClip(project, clipId)?.clip.fadeIn.curve ?? 'equal-power', seconds: Math.max(0, (moveEvent.clientX - bounds.left) / state.pxPerSec) } }), `fade:${clipId}`);
          break;
        case 'fade-out':
          editProject((project) => updateClip(project, clipId, { fadeOut: { curve: findClip(project, clipId)?.clip.fadeOut.curve ?? 'equal-power', seconds: Math.max(0, (bounds.right - moveEvent.clientX) / state.pxPerSec) } }), `fade:${clipId}`);
          break;
      }
    };
    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const onBodyDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    if (x <= EDGE_PX) begin(event, 'trim-start');
    else if (x >= bounds.width - EDGE_PX) begin(event, 'trim-end');
    else begin(event, 'move');
  };

  const height = LANE_HEIGHT - 12;
  const fadeInWidth = Math.min(clipWidth, clip.fadeIn.seconds * pxPerSec);
  const fadeOutWidth = Math.min(clipWidth, clip.fadeOut.seconds * pxPerSec);

  return (
    <div
      className="studio-clip"
      data-selected={selected || undefined}
      data-clip-id={clip.id}
      style={{ left: clipLeft, width: clipWidth }}
      onPointerDown={onBodyDown}
    >
      <canvas ref={canvasRef} className="studio-wave" style={{ left: Math.floor(visibleStart) }} />
      <div className="studio-clip-label">
        <span>{asset.title}</span>
        {clip.speed !== 1 && <b>{`${Number(clip.speed.toFixed(2))}×`}</b>}
      </div>
      <svg className="studio-fades" width={clipWidth} height={height} aria-hidden="true">
        {clip.fadeIn.seconds > 0 && <polyline className="studio-fade-line" points={fadePath(clip.fadeIn, fadeInWidth, height, true)} />}
        {clip.fadeOut.seconds > 0 && (
          <polyline className="studio-fade-line" points={fadePath(clip.fadeOut, fadeOutWidth, height, false)} transform={`translate(${clipWidth - fadeOutWidth} 0)`} />
        )}
      </svg>
      {selected && (
        <>
          <div className="studio-handle" style={{ left: Math.max(0, fadeInWidth - 5) }} onPointerDown={(event) => begin(event, 'fade-in')} />
          <div className="studio-handle" style={{ right: Math.max(0, fadeOutWidth - 5), left: 'auto' }} onPointerDown={(event) => begin(event, 'fade-out')} />
        </>
      )}
    </div>
  );
}

export const StudioClipItem = memo(StudioClipView);
