import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { projectDurationSec } from '@ton/core';
import { HEADER_WIDTH, RULER_HEIGHT, TAIL_SECONDS } from './studio-geometry';
import { StudioLane } from './studio-lane';
import { StudioRuler } from './studio-ruler';
import { seek, setViewWidth, setZoom, useStudioStore } from './studio-store';

/** One wheel notch (or a trackpad pinch) changes the scale by this factor. */
const WHEEL_ZOOM = 1.15;

function Playhead() {
  const playheadSec = useStudioStore((state) => state.playheadSec);
  const pxPerSec = useStudioStore((state) => state.pxPerSec);
  return <div className="studio-playhead" style={{ left: HEADER_WIDTH + playheadSec * pxPerSec }} />;
}

export function StudioTimeline() {
  const project = useStudioStore((state) => state.project);
  const pxPerSec = useStudioStore((state) => state.pxPerSec);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const autoFit = useStudioStore((state) => state.autoFit);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 900 });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const width = Math.max(0, element.clientWidth - HEADER_WIDTH);
      setViewWidth(width);
      setView((previous) => (previous.left === element.scrollLeft && previous.width === width ? previous : { left: element.scrollLeft, width }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    element.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // The wheel over the songs zooms around the pointer, like the zoom slider: the time under the pointer stays where it
  // is. Over the lane names it scrolls the lanes up and down; Shift + wheel scrolls sideways.
  const anchorRef = useRef<{ sec: number; pointerX: number } | null>(null);
  const lastWheelRef = useRef<{ sec: number; pointerX: number; at: number } | null>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const pointerX = event.clientX - element.getBoundingClientRect().left - HEADER_WIDTH;
      if (event.shiftKey || (pointerX < 0 && !event.ctrlKey) || event.deltaY === 0) return;
      event.preventDefault();
      const scale = useStudioStore.getState().pxPerSec;
      const x = Math.max(0, pointerX);
      // Successive notches with the pointer at rest keep the first anchor time, so the whole-pixel rounding of the
      // scroll position cannot add up into a visible drift.
      const last = lastWheelRef.current;
      const sec = last && Math.abs(last.pointerX - x) < 1 && event.timeStamp - last.at < 600 ? last.sec : (element.scrollLeft + x) / scale;
      lastWheelRef.current = { sec, pointerX: x, at: event.timeStamp };
      anchorRef.current = { sec, pointerX: x };
      // A mouse notch is about 100 px of delta; trackpads send many small deltas, which zoom smoothly.
      setZoom(scale * WHEEL_ZOOM ** (-event.deltaY / 100));
      if (useStudioStore.getState().pxPerSec === scale) anchorRef.current = null;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // The new width only exists after React has rendered it, so the scroll that keeps the anchor in place waits until then.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const anchor = anchorRef.current;
    if (!element || !anchor) return;
    anchorRef.current = null;
    element.scrollLeft = anchor.sec * pxPerSec - anchor.pointerX;
  }, [pxPerSec]);

  // While playing the view follows the playhead so it never runs off screen.
  useEffect(() => useStudioStore.subscribe((state, previous) => {
    const element = scrollRef.current;
    if (!element || !state.playing || state.playheadSec === previous.playheadSec) return;
    const x = state.playheadSec * state.pxPerSec;
    const visibleWidth = element.clientWidth - HEADER_WIDTH;
    if (x > element.scrollLeft + visibleWidth - 60 || x < element.scrollLeft) element.scrollLeft = Math.max(0, x - 80);
  }), []);

  const duration = projectDurationSec(project);
  const totalWidth = Math.max(duration + (autoFit ? 0 : TAIL_SECONDS), view.width / pxPerSec) * pxPerSec;

  return (
    <div className="studio-timeline" ref={scrollRef}>
      <div className="studio-content" style={{ width: HEADER_WIDTH + totalWidth }}>
        <div className="studio-ruler-row" style={{ height: RULER_HEIGHT }}>
          <div className="studio-ruler-corner" style={{ width: HEADER_WIDTH }} />
          <StudioRuler pxPerSec={pxPerSec} gridBpm={project.gridBpm} viewLeft={view.left} viewWidth={view.width} totalWidth={totalWidth} onSeek={seek} />
        </div>
        {project.tracks.map((track) => (
          <StudioLane
            key={track.id}
            track={track}
            project={project}
            selectedClipId={selectedClipId}
            selectedTrackId={selectedTrackId}
            pxPerSec={pxPerSec}
            viewLeft={view.left}
            viewWidth={view.width}
            totalWidth={totalWidth}
          />
        ))}
        <Playhead />
      </div>
    </div>
  );
}
