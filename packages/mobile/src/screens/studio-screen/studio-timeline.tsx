import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { projectDurationSec, type StudioTrack } from '@ton/core';
import { selectTrack, seek, setViewWidth as reportViewWidth, useStudioStore } from '../../stores/studio-store';
import { LANE_HEIGHT, StudioClipItem } from './studio-clip';
import { STUDIO_COLORS } from './studio-ui';

const RULER_HEIGHT = 24;
const TAIL_SECONDS = 20;
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function formatTick(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function Ruler({ pxPerSec, totalWidth }: { pxPerSec: number; totalWidth: number }) {
  const step = RULER_STEPS.find((candidate) => candidate * pxPerSec >= 56) ?? RULER_STEPS[RULER_STEPS.length - 1];
  const ticks: number[] = [];
  for (let second = 0; second * pxPerSec <= totalWidth; second += step) ticks.push(second);
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="timeline"
      onPress={(event) => seek(event.nativeEvent.locationX / pxPerSec)}
      style={{ height: RULER_HEIGHT, width: totalWidth, borderBottomWidth: 0.5, borderBottomColor: STUDIO_COLORS.border, backgroundColor: STUDIO_COLORS.surface }}
    >
      {ticks.map((second) => (
        <View key={second} pointerEvents="none" style={{ position: 'absolute', left: second * pxPerSec, top: 0, bottom: 0, borderLeftWidth: 0.5, borderLeftColor: STUDIO_COLORS.dim }}>
          <Text style={{ marginLeft: 3, marginTop: 3, color: STUDIO_COLORS.dim, fontSize: 10 }}>{formatTick(second)}</Text>
        </View>
      ))}
    </Pressable>
  );
}

function Playhead({ pxPerSec }: { pxPerSec: number }) {
  const playheadSec = useStudioStore((state) => state.playheadSec);
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: playheadSec * pxPerSec - 1, width: 2, backgroundColor: STUDIO_COLORS.playhead }} />;
}

export function StudioTimeline() {
  const project = useStudioStore((state) => state.project);
  const pxPerSec = useStudioStore((state) => state.pxPerSec);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const revision = useStudioStore((state) => state.peaksRevision);
  const autoFit = useStudioStore((state) => state.autoFit);
  const [dragging, setDragging] = useState(false);
  const [viewWidth, setViewWidth] = useState(360);
  const totalWidth = Math.max(projectDurationSec(project) + (autoFit ? 0 : TAIL_SECONDS), viewWidth / pxPerSec) * pxPerSec;

  const renderLane = useCallback(({ item }: { item: StudioTrack }) => (
    <Pressable
      onPress={() => selectTrack(item.id)}
      style={{ height: LANE_HEIGHT, width: totalWidth, borderBottomWidth: 0.5, borderBottomColor: STUDIO_COLORS.border, backgroundColor: item.id === selectedTrackId ? 'rgba(255,255,255,0.04)' : 'transparent', opacity: item.muted ? 0.45 : 1 }}
    >
      {item.clips.map((clip) => {
        const asset = project.assets[clip.assetId];
        return asset ? (
          <StudioClipItem key={clip.id} clip={clip} asset={asset} selected={selectedClipId === clip.id} pxPerSec={pxPerSec} revision={revision} onDragState={setDragging} />
        ) : null;
      })}
    </Pressable>
  ), [project.assets, selectedClipId, selectedTrackId, pxPerSec, revision, totalWidth]);

  return (
    <ScrollView
      horizontal
      scrollEnabled={!dragging}
      onLayout={(event) => { setViewWidth(event.nativeEvent.layout.width); reportViewWidth(event.nativeEvent.layout.width); }}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: STUDIO_COLORS.background }}
      contentContainerStyle={{ width: totalWidth }}
    >
      <View style={{ width: totalWidth, flex: 1 }}>
        <Ruler pxPerSec={pxPerSec} totalWidth={totalWidth} />
        <FlatList
          data={project.tracks}
          keyExtractor={(track) => track.id}
          renderItem={renderLane}
          scrollEnabled={!dragging}
          extraData={selectedClipId}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
          nestedScrollEnabled
        />
        <Playhead pxPerSec={pxPerSec} />
      </View>
    </ScrollView>
  );
}
