import { snapToBeat, type StudioProject } from '@ton/core';

export const HEADER_WIDTH = 216;
export const LANE_HEIGHT = 92;
export const RULER_HEIGHT = 30;
/** Free space after the last clip so there is always somewhere to drop or extend. */
export const TAIL_SECONDS = 20;

/** Snaps a time to the beat grid when one is known. `division` is in beats (1 = beat, 4 = bar), 0 = free movement. */
export function snapTime(timeSec: number, project: StudioProject, division: number, bypass = false): number {
  const bpm = project.gridBpm;
  if (bypass || division <= 0 || !bpm) return Math.max(0, timeSec);
  return Math.max(0, snapToBeat(timeSec, bpm, division));
}

/** The lane under a screen position, found through the data attribute the lane rows carry. */
export function laneIdAt(clientX: number, clientY: number): string | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (element instanceof HTMLElement && element.dataset.laneId) return element.dataset.laneId;
  }
  return null;
}
