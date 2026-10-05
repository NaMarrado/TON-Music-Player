import { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { projectDurationSec } from '@ton/core';
import { fitToWindow, setZoom, stopPlayback, togglePlay, undo, redo, useStudioStore } from '../../stores/studio-store';
import { ClearModal, ExportModal } from './studio-export-modal';
import { StudioEdit } from './studio-edit';
import { StudioSongs, type SongSource } from './studio-songs';
import { StudioTimeline } from './studio-timeline';
import { StudioButton, StudioHint, STUDIO_COLORS } from './studio-ui';

const ZOOM_STEP = 1.35;
const ICON = 20;

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}

function PlayheadTime() {
  const playheadSec = useStudioStore((state) => state.playheadSec);
  const duration = useStudioStore((state) => projectDurationSec(state.project));
  return <Text style={{ color: STUDIO_COLORS.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>{clock(playheadSec)} <Text style={{ color: STUDIO_COLORS.dim }}>/ {clock(duration)}</Text></Text>;
}

/** The bottom panel's tab. It is always two tabs of the same size, so the panel never changes. */
function PanelTab({ control, active, onPress, children }: { control: string; active: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <StudioButton control={control} onPress={onPress} active={active} label>{children}</StudioButton>
    </View>
  );
}

export function StudioScreen() {
  const { t } = useTranslation('studio');
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const hasLanes = useStudioStore((state) => state.project.tracks.length > 0);
  const playing = useStudioStore((state) => state.playing);
  const rendering = useStudioStore((state) => state.rendering);
  const canUndo = useStudioStore((state) => state.past.length > 0);
  const canRedo = useStudioStore((state) => state.future.length > 0);
  const pxPerSec = useStudioStore((state) => state.pxPerSec);
  const editRequest = useStudioStore((state) => state.editRequest);
  const [tab, setTab] = useState<'songs' | 'edit'>('songs');
  const [source, setSource] = useState<SongSource>('library');
  const [exportOpen, setExportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(100);
  const color = STUDIO_COLORS.text;
  /** One fixed share of the screen: selecting a clip or switching tabs swaps the contents, never the size. */
  const panelHeight = Math.round(height * 0.44);

  // Picking a clip means the user wants to edit it, as on the desktop. (Adding a song does not count as picking.)
  useEffect(() => { if (editRequest > 0) setTab('edit'); }, [editRequest]);

  return (
    <View style={{ flex: 1, backgroundColor: STUDIO_COLORS.background, paddingTop: insets.top }}>
      <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StudioButton control={playing ? 'pause' : 'play'} onPress={() => { void togglePlay(); }} disabled={!hasLanes} active={playing} hintAt="top"><Feather name={playing ? 'pause' : 'play'} size={ICON} color={color} /></StudioButton>
          <StudioButton control="stop" onPress={() => { void stopPlayback(true); }} disabled={!hasLanes} hintAt="top"><Feather name="square" size={17} color={color} /></StudioButton>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <PlayheadTime />
            {rendering && <MaterialCommunityIcons name="progress-clock" size={16} color={STUDIO_COLORS.dim} accessibilityLabel={t('rendering')} />}
          </View>
          <StudioButton control="undo" onPress={undo} disabled={!canUndo} hintAt="top"><Feather name="rotate-ccw" size={ICON} color={color} /></StudioButton>
          <StudioButton control="redo" onPress={redo} disabled={!canRedo} hintAt="top"><Feather name="rotate-cw" size={ICON} color={color} /></StudioButton>
          <View style={{ width: 6 }} />
          <StudioButton control="export" onPress={() => setExportOpen(true)} disabled={!hasLanes} hintAt="top"><Feather name="download" size={ICON} color={color} /></StudioButton>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StudioButton control="zoom-out" onPress={() => setZoom(pxPerSec / ZOOM_STEP)} hintAt="top"><Feather name="zoom-out" size={ICON} color={color} /></StudioButton>
          <StudioButton control="zoom-in" onPress={() => setZoom(pxPerSec * ZOOM_STEP)} hintAt="top"><Feather name="zoom-in" size={ICON} color={color} /></StudioButton>
          <StudioButton control="zoom-fit" onPress={fitToWindow} disabled={!hasLanes} hintAt="top"><MaterialCommunityIcons name="arrow-expand-horizontal" size={ICON} color={color} /></StudioButton>
          <View style={{ flex: 1 }} />
          <StudioButton control="clear" onPress={() => setClearOpen(true)} disabled={!hasLanes} hintAt="top"><Feather name="refresh-ccw" size={19} color={color} /></StudioButton>
        </View>
      </View>

      {hasLanes ? (
        <StudioTimeline />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
          <Text style={{ color: STUDIO_COLORS.dim, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{t('emptyText')}</Text>
        </View>
      )}

      <View style={{ height: panelHeight, backgroundColor: STUDIO_COLORS.surface, borderTopWidth: 0.5, borderTopColor: STUDIO_COLORS.border }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: STUDIO_COLORS.border }}>
          <PanelTab control="tab-songs" active={tab === 'songs'} onPress={() => setTab('songs')}><Feather name="music" size={18} color={color} /></PanelTab>
          <PanelTab control="tab-edit" active={tab === 'edit'} onPress={() => setTab('edit')}><Feather name="sliders" size={18} color={color} /></PanelTab>
        </View>
        <View style={{ flex: 1 }}>
          {tab === 'songs' ? <StudioSongs source={source} onSource={setSource} /> : <StudioEdit />}
        </View>
      </View>

      <StudioHint anchor="top" offset={insets.top + headerHeight + 6} />
      <StudioHint anchor="bottom" offset={panelHeight + 8} />
      <ExportModal visible={exportOpen} onClose={() => setExportOpen(false)} />
      <ClearModal visible={clearOpen} onClose={() => setClearOpen(false)} />
    </View>
  );
}
