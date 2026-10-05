import { projectDurationSec } from '@ton/core';
import { StudioButton, StudioSlider } from './studio-controls';
import { formatClock } from './studio-format';
import {
  ExportIcon, FitIcon, MagnetIcon, PauseIcon, PlayIcon, RedoIcon, ResetIcon, StopIcon, UndoIcon, ZoomInIcon, ZoomOutIcon,
} from './studio-icons';
import {
  fitToWindow, redo, setSnap, setZoom, sliderToZoom, stopPlayback, togglePlay, undo, useStudioStore, zoomToSlider,
} from './studio-store';

const ZOOM_STEP = 1.35;

function PlayTime() {
  const playheadSec = useStudioStore((state) => state.playheadSec);
  const duration = useStudioStore((state) => projectDurationSec(state.project));
  return <span className="studio-time">{formatClock(playheadSec, true)} <i>/ {formatClock(duration)}</i></span>;
}

interface Props {
  onExport: () => void;
  onClear: () => void;
}

/** Everything global lives here, in four groups from left to right: playback, history, view, export. */
export function StudioBar({ onExport, onClear }: Props) {
  const empty = useStudioStore((state) => state.project.tracks.length === 0);
  const playing = useStudioStore((state) => state.playing);
  const pxPerSec = useStudioStore((state) => state.pxPerSec);
  const snapBeats = useStudioStore((state) => state.snapBeats);
  const canUndo = useStudioStore((state) => state.past.length > 0);
  const canRedo = useStudioStore((state) => state.future.length > 0);

  return (
    <header className="studio-bar" role="toolbar">
      <div className="studio-group" data-group="playback">
        <StudioButton control={playing ? 'pause' : 'play'} onClick={togglePlay} disabled={empty} tone="primary">{playing ? <PauseIcon /> : <PlayIcon />}</StudioButton>
        <StudioButton control="stop" onClick={stopPlayback} disabled={empty}><StopIcon /></StudioButton>
        <PlayTime />
      </div>
      <div className="studio-group" data-group="history">
        <StudioButton control="undo" onClick={undo} disabled={!canUndo}><UndoIcon /></StudioButton>
        <StudioButton control="redo" onClick={redo} disabled={!canRedo}><RedoIcon /></StudioButton>
      </div>
      <div className="studio-group" data-group="view">
        <StudioButton control="zoom-out" onClick={() => setZoom(pxPerSec / ZOOM_STEP)}><ZoomOutIcon /></StudioButton>
        <StudioSlider control="zoom-slider" bare value={zoomToSlider(pxPerSec)} min={0} max={1} step={0.005} format={() => ''} onChange={(value) => setZoom(sliderToZoom(value))} />
        <StudioButton control="zoom-in" onClick={() => setZoom(pxPerSec * ZOOM_STEP)}><ZoomInIcon /></StudioButton>
        <StudioButton control="zoom-fit" onClick={fitToWindow} disabled={empty}><FitIcon /></StudioButton>
        <span className="studio-divider" />
        <MagnetIcon />
        <div className="studio-segment" role="group">
          <StudioButton control="snap-off" onClick={() => setSnap(0)} active={snapBeats === 0} label />
          <StudioButton control="snap-beat" onClick={() => setSnap(1)} active={snapBeats === 1} label />
          <StudioButton control="snap-bar" onClick={() => setSnap(4)} active={snapBeats === 4} label />
        </div>
      </div>
      <div className="studio-group studio-group-end" data-group="export">
        <StudioButton control="clear" onClick={onClear} disabled={empty}><ResetIcon /></StudioButton>
        <StudioButton control="export" onClick={onExport} disabled={empty} label tone="primary"><ExportIcon /></StudioButton>
      </div>
    </header>
  );
}
