export type PositionListener = (position: number, duration: number) => void;

type PlaybackRuntimeState = {
  rafId: number | null;
  initialized: boolean;
  crossfadeTriggered: boolean;
  preloadedIndex: number;
  positionListeners: Set<PositionListener>;
};

const state: PlaybackRuntimeState = {
  rafId: null,
  initialized: false,
  crossfadeTriggered: false,
  preloadedIndex: -1,
  positionListeners: new Set<PositionListener>(),
};

export function getPlaybackRuntimeState(): PlaybackRuntimeState {
  return state;
}
