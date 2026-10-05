import { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import {
  clipDurationSec,
  fadeInGain,
  fadeOutGain,
  moveClip,
  trimClipEnd,
  trimClipStart,
  type StudioAsset,
  type StudioClip,
  type StudioFade,
} from '@ton/core';
import { editProject, getPeaks, moveClipByLanes, selectClip, useStudioStore } from '../../stores/studio-store';
import { Waveform } from './studio-waveform';
import { STUDIO_COLORS } from './studio-ui';

export const LANE_HEIGHT = 72;
const CLIP_HEIGHT = LANE_HEIGHT - 8;
const EDGE = 22;
const FADE_POINTS = 20;

function fadePoints(fade: StudioFade, width: number, rising: boolean): string {
  const points: string[] = [];
  for (let index = 0; index <= FADE_POINTS; index += 1) {
    const progress = index / FADE_POINTS;
    const gain = rising ? fadeInGain(fade.curve, progress) : fadeOutGain(fade.curve, progress);
    points.push(`${(progress * width).toFixed(1)},${(CLIP_HEIGHT - gain * (CLIP_HEIGHT - 6) - 3).toFixed(1)}`);
  }
  return points.join(' ');
}

type DragMode = 'move' | 'trim-start' | 'trim-end';

interface Props {
  clip: StudioClip;
  asset: StudioAsset;
  selected: boolean;
  pxPerSec: number;
  revision: number;
  /** Lets the surrounding list stop scrolling while a clip is being dragged. */
  onDragState: (dragging: boolean) => void;
}

function StudioClipView({ clip, asset, selected, pxPerSec, revision, onDragState }: Props) {
  const phase = useStudioStore((state) => state.assetPhase[asset.id]);
  const width = Math.max(4, clipDurationSec(clip) * pxPerSec);
  const latest = useRef({ clip, selected, pxPerSec, onDragState });
  latest.current = { clip, selected, pxPerSec, onDragState };
  const drag = useRef<{ mode: DragMode; origStart: number; origEnd: number } | null>(null);
  const [lift, setLift] = useState(0);

  // Only a selected clip can be dragged; an unselected one lets the touch scroll the timeline.
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.selected,
    onMoveShouldSetPanResponder: () => latest.current.selected,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const { clip: current, pxPerSec: scale } = latest.current;
      const clipWidth = clipDurationSec(current) * scale;
      const x = event.nativeEvent.locationX;
      const mode: DragMode = x <= EDGE ? 'trim-start' : x >= clipWidth - EDGE ? 'trim-end' : 'move';
      drag.current = { mode, origStart: current.startSec, origEnd: current.startSec + clipDurationSec(current) };
      latest.current.onDragState(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const active = drag.current;
      if (!active) return;
      const delta = gesture.dx / latest.current.pxPerSec;
      const id = latest.current.clip.id;
      if (active.mode === 'move') {
        editProject((project) => moveClip(project, id, Math.max(0, active.origStart + delta)), `move:${id}`);
        // The clip follows the finger up and down too; it changes lanes when the finger lifts.
        setLift(gesture.dy);
      } else if (active.mode === 'trim-start') editProject((project) => trimClipStart(project, id, Math.max(0, active.origStart + delta)), `trim:${id}`);
      else editProject((project) => trimClipEnd(project, id, active.origEnd + delta), `trim:${id}`);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (drag.current?.mode === 'move') moveClipByLanes(latest.current.clip.id, Math.round(gesture.dy / LANE_HEIGHT));
      drag.current = null;
      setLift(0);
      latest.current.onDragState(false);
    },
    onPanResponderTerminate: () => { drag.current = null; setLift(0); latest.current.onDragState(false); },
  }), []);

  const fadeInWidth = Math.min(width, clip.fadeIn.seconds * pxPerSec);
  const fadeOutWidth = Math.min(width, clip.fadeOut.seconds * pxPerSec);

  return (
    <View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left: clip.startSec * pxPerSec,
        top: 4 + lift,
        zIndex: lift === 0 ? 0 : 10,
        elevation: lift === 0 ? 0 : 10,
        width,
        height: CLIP_HEIGHT,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? STUDIO_COLORS.text : 'rgba(232,137,43,0.45)',
        backgroundColor: 'rgba(232,137,43,0.12)',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={asset.title}
        accessibilityState={{ selected }}
        onPress={() => selectClip(clip.id)}
        style={{ flex: 1 }}
      >
        <Waveform clip={clip} assetDurationSec={asset.durationSec} peaks={getPeaks(asset.id)} width={width} height={CLIP_HEIGHT} revision={revision} />
        <View style={{ position: 'absolute', top: 2, left: 6, right: 6, flexDirection: 'row', alignItems: 'baseline', gap: 6 }} pointerEvents="none">
          <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.9)', fontSize: 11 }}>{asset.title}</Text>
          {asset.bpm !== null && <Text style={{ color: STUDIO_COLORS.waveCore, fontSize: 10 }}>{Math.round(asset.bpm)}</Text>}
          {asset.key !== null && <Text style={{ color: STUDIO_COLORS.waveCore, fontSize: 10 }}>{asset.key}</Text>}
          {clip.speed !== 1 && <Text style={{ color: '#ffd9a8', fontSize: 10 }}>{`${Number(clip.speed.toFixed(2))}×`}</Text>}
        </View>
        {phase === 'loading' && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: STUDIO_COLORS.wave, opacity: 0.6 }} />}
        <Svg width={width} height={CLIP_HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {clip.fadeIn.seconds > 0 && <Polyline points={fadePoints(clip.fadeIn, fadeInWidth, true)} fill="none" stroke={STUDIO_COLORS.fade} strokeWidth={2} />}
          {clip.fadeOut.seconds > 0 && (
            <Polyline points={fadePoints(clip.fadeOut, fadeOutWidth, false)} fill="none" stroke={STUDIO_COLORS.fade} strokeWidth={2} transform={`translate(${width - fadeOutWidth} 0)`} />
          )}
        </Svg>
        {selected && (
          <>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: STUDIO_COLORS.text, opacity: 0.8 }} />
            <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, backgroundColor: STUDIO_COLORS.text, opacity: 0.8 }} />
          </>
        )}
      </Pressable>
    </View>
  );
}

export const StudioClipItem = memo(StudioClipView);
