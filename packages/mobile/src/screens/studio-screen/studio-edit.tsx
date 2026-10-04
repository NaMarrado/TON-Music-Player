import { ScrollView, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  STUDIO_NEW_LANE_VOLUME,
  STUDIO_PRESETS,
  applyPreset,
  clipBpm,
  connectClip,
  findClip,
  syncClipTempo,
  updateClip,
  updateTrack,
  updateTrackEffects,
  type StudioEffects,
  type StudioFadeCurve,
  type StudioPreset,
} from '@ton/core';
import {
  connectSelectedClip, deleteSelectedClip, duplicateSelectedClip, editProject, setClipFade, setTransitionBars, setTransitionCurve, splitAtPlayhead,
  transitionIntoSelected, useStudioStore,
} from '../../stores/studio-store';
import { StudioButton, StudioSection, StudioSlider, STUDIO_COLORS } from './studio-ui';

type McIcon = keyof typeof MaterialCommunityIcons.glyphMap;

const LOOK_ICONS: Record<StudioPreset, McIcon> = {
  slowed: 'speedometer-slow',
  slowedReverb: 'waves',
  spedUp: 'speedometer',
  bassBoost: 'speaker',
  muffled: 'blur',
  reset: 'restore',
};
const LOOK_IDS: Record<StudioPreset, string> = {
  slowed: 'look-slowed',
  slowedReverb: 'look-slowed-reverb',
  spedUp: 'look-sped-up',
  bassBoost: 'look-bass-boost',
  muffled: 'look-muffled',
  reset: 'look-reset',
};
const CURVES: Array<{ curve: StudioFadeCurve; control: string; icon: McIcon }> = [
  { curve: 'equal-power', control: 'curve-smooth', icon: 'chart-bell-curve-cumulative' },
  { curve: 'linear', control: 'curve-straight', icon: 'slash-forward' },
  { curve: 'exponential', control: 'curve-slow', icon: 'chart-line-variant' },
];
const BARS = [2, 4, 8, 16];
const LOG_MIN = Math.log2(40);
const LOG_MAX = Math.log2(16000);
const ICON = 18;

const signed = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}${unit}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const mc = (name: McIcon) => <MaterialCommunityIcons name={name} size={ICON} color={STUDIO_COLORS.text} />;
const ft = (name: keyof typeof Feather.glyphMap) => <Feather name={name} size={ICON} color={STUDIO_COLORS.text} />;

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;
}

export function StudioEdit() {
  const { t } = useTranslation('studio');
  const project = useStudioStore((state) => state.project);
  const selectedClipId = useStudioStore((state) => state.selectedClipId);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const transitionBars = useStudioStore((state) => state.transitionBars);
  const transitionCurve = useStudioStore((state) => state.transitionCurve);
  const found = selectedClipId ? findClip(project, selectedClipId) : null;
  const track = found?.track ?? project.tracks.find((candidate) => candidate.id === selectedTrackId) ?? null;
  const clip = found?.clip ?? null;
  const asset = clip ? project.assets[clip.assetId] : undefined;
  const effects = track?.effects;
  const noClip = clip === null;
  const noLane = track === null;
  const trackId = track?.id ?? '';
  const clipId = clip?.id ?? '';
  const reverb = effects?.reverb ?? { mix: 0, size: 0.5, damping: 0.3 };
  const echo = effects?.echo ?? { mix: 0, seconds: 0.3, feedback: 0.4 };
  const filter = effects?.filter ?? null;
  const maxFade = clip ? Math.max(1, Math.min(30, (clip.outSec - clip.inSec) / clip.speed / 2)) : 10;

  const setEffects = (patch: Partial<StudioEffects>, key: string) => editProject((p) => updateTrackEffects(p, trackId, patch), `fx:${trackId}:${key}`);
  const setClip = (patch: Parameters<typeof updateClip>[2], key: string) => editProject((p) => updateClip(p, clipId, patch), `clip:${clipId}:${key}`);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 52, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: STUDIO_COLORS.border }}>
        {asset ? (
          <>
            <Text numberOfLines={1} style={{ color: STUDIO_COLORS.text, fontSize: 14, fontWeight: '600' }}>{asset.title}</Text>
            <Text numberOfLines={1} style={{ color: STUDIO_COLORS.dim, fontSize: 12 }}>{asset.artist}</Text>
          </>
        ) : (
          <Text numberOfLines={2} style={{ color: '#6f6f6f', fontSize: 12.5, lineHeight: 17 }}>{t(noLane ? 'editEmpty' : 'editLaneOnly')}</Text>
        )}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <StudioSection title={t('sections.clip')}>
          <Row>
            <StudioButton control="clip-split" onPress={splitAtPlayhead} disabled={noLane} label>{ft('scissors')}</StudioButton>
            <StudioButton control="clip-join" onPress={connectSelectedClip} disabled={noClip || connectClip(project, clipId) === project} label>{ft('link')}</StudioButton>
            <StudioButton control="clip-duplicate" onPress={duplicateSelectedClip} disabled={noClip} label>{ft('copy')}</StudioButton>
            <StudioButton control="clip-delete" onPress={deleteSelectedClip} disabled={noClip} label>{ft('trash-2')}</StudioButton>
          </Row>
        </StudioSection>

        <StudioSection title={t('sections.looks')}>
          <Row>
            {STUDIO_PRESETS.map((preset) => (
              <StudioButton key={preset} control={LOOK_IDS[preset]} onPress={() => editProject((p) => applyPreset(p, trackId, preset))} disabled={noLane} label>
                {mc(LOOK_ICONS[preset])}
              </StudioButton>
            ))}
          </Row>
        </StudioSection>

        <StudioSection title={t('sections.speed')}>
          <StudioSlider control="speed" value={clip?.speed ?? 1} min={0.25} max={2} step={0.01} disabled={noClip} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => setClip({ speed }, 'speed')} />
          <StudioSlider control="pitch" value={clip?.semitones ?? 0} min={-12} max={12} step={1} disabled={noClip} format={(v) => signed(v, '')} onChange={(semitones) => setClip({ semitones }, 'semitones')} />
          <Row>
            <StudioButton control="keep-pitch" onPress={() => setClip({ pitchLock: !clip?.pitchLock }, 'lock')} active={clip?.pitchLock ?? false} disabled={noClip} label>{ft('lock')}</StudioButton>
            <StudioButton control="reverse" onPress={() => setClip({ reverse: !clip?.reverse }, 'reverse')} active={clip?.reverse ?? false} disabled={noClip} label>{ft('rewind')}</StudioButton>
            <StudioButton
              control="match-tempo"
              onPress={() => editProject((p) => syncClipTempo(p, clipId, project.gridBpm ?? 0))}
              disabled={noClip || !project.gridBpm || !(clip && clipBpm(clip, asset))}
              label
            >
              {mc('metronome')}
            </StudioButton>
          </Row>
        </StudioSection>

        <StudioSection title={t('sections.sound')}>
          <StudioSlider control="clip-volume" value={clip?.gainDb ?? 0} min={-24} max={12} step={0.5} disabled={noClip} format={(v) => signed(v, ' dB')} onChange={(gainDb) => setClip({ gainDb }, 'gain')} />
          <StudioSlider control="lane-volume" value={track?.volume ?? STUDIO_NEW_LANE_VOLUME} min={0} max={1} step={0.01} disabled={noLane} format={percent} onChange={(volume) => editProject((p) => updateTrack(p, trackId, { volume }), `vol:${trackId}`)} />
          <StudioSlider control="balance" value={effects?.pan ?? 0} min={-1} max={1} step={0.01} disabled={noLane} format={(v) => (Math.abs(v) < 0.02 ? '0' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)} onChange={(pan) => setEffects({ pan }, 'pan')} />
          <StudioSlider control="bass" value={effects?.bassDb ?? 0} min={-12} max={15} step={0.5} disabled={noLane} format={(v) => signed(v, ' dB')} onChange={(bassDb) => setEffects({ bassDb }, 'bass')} />
          <StudioSlider control="treble" value={effects?.trebleDb ?? 0} min={-12} max={12} step={0.5} disabled={noLane} format={(v) => signed(v, ' dB')} onChange={(trebleDb) => setEffects({ trebleDb }, 'treble')} />
        </StudioSection>

        <StudioSection title={t('sections.effects')}>
          <StudioSlider control="reverb" value={reverb.mix} min={0} max={1} step={0.01} disabled={noLane} format={percent} onChange={(mix) => setEffects({ reverb: mix > 0 ? { ...reverb, mix } : null }, 'reverb')} />
          <StudioSlider control="reverb-size" value={reverb.size} min={0} max={1} step={0.05} disabled={noLane || !effects?.reverb} format={percent} onChange={(size) => setEffects({ reverb: { ...reverb, size } }, 'reverb-size')} />
          <StudioSlider control="reverb-dark" value={reverb.damping} min={0} max={1} step={0.05} disabled={noLane || !effects?.reverb} format={percent} onChange={(damping) => setEffects({ reverb: { ...reverb, damping } }, 'reverb-damp')} />
          <StudioSlider control="echo" value={echo.mix} min={0} max={1} step={0.01} disabled={noLane} format={percent} onChange={(mix) => setEffects({ echo: mix > 0 ? { ...echo, mix } : null }, 'echo')} />
          <StudioSlider control="echo-time" value={echo.seconds} min={0.05} max={1.5} step={0.01} disabled={noLane || !effects?.echo} format={(v) => `${v.toFixed(2)} s`} onChange={(seconds) => setEffects({ echo: { ...echo, seconds } }, 'echo-time')} />
          <StudioSlider control="echo-repeats" value={echo.feedback} min={0} max={0.9} step={0.01} disabled={noLane || !effects?.echo} format={percent} onChange={(feedback) => setEffects({ echo: { ...echo, feedback } }, 'echo-fb')} />
          <Row>
            <StudioButton control="filter-off" onPress={() => setEffects({ filter: null }, 'filter')} active={filter === null} disabled={noLane} label>{ft('slash')}</StudioButton>
            <StudioButton control="filter-low" onPress={() => setEffects({ filter: { type: 'lowpass', hz: filter?.hz ?? 1500 } }, 'filter')} active={filter?.type === 'lowpass'} disabled={noLane} label>{mc('blur')}</StudioButton>
            <StudioButton control="filter-high" onPress={() => setEffects({ filter: { type: 'highpass', hz: filter?.hz ?? 400 } }, 'filter')} active={filter?.type === 'highpass'} disabled={noLane} label>{mc('signal-cellular-3')}</StudioButton>
          </Row>
          <StudioSlider
            control="filter-freq"
            value={Math.log2(filter?.hz ?? 1000)}
            min={LOG_MIN}
            max={LOG_MAX}
            step={0.01}
            disabled={noLane || !filter}
            format={(v) => `${Math.round(2 ** v)} Hz`}
            onChange={(v) => filter && setEffects({ filter: { type: filter.type, hz: Math.round(2 ** v) } }, 'filter')}
          />
        </StudioSection>

        <StudioSection title={t('sections.fades')}>
          <StudioSlider control="fade-in" value={clip?.fadeIn.seconds ?? 0} min={0} max={maxFade} step={0.1} disabled={noClip} format={(v) => `${v.toFixed(1)} s`} onChange={(seconds) => setClipFade(clipId, 'fadeIn', seconds)} />
          <StudioSlider control="fade-out" value={clip?.fadeOut.seconds ?? 0} min={0} max={maxFade} step={0.1} disabled={noClip} format={(v) => `${v.toFixed(1)} s`} onChange={(seconds) => setClipFade(clipId, 'fadeOut', seconds)} />
        </StudioSection>

        <StudioSection title={t('sections.transition')}>
          <Row>
            {BARS.map((bars) => (
              <StudioButton key={bars} control={`transition-bars-${bars}`} onPress={() => setTransitionBars(bars)} active={transitionBars === bars} label />
            ))}
          </Row>
          <View style={{ height: 6 }} />
          <Row>
            {CURVES.map(({ curve, control, icon }) => (
              <StudioButton key={curve} control={control} onPress={() => setTransitionCurve(curve)} active={transitionCurve === curve} label>{mc(icon)}</StudioButton>
            ))}
          </Row>
          <View style={{ height: 6 }} />
          <StudioButton control="transition-apply" onPress={() => { transitionIntoSelected(); }} disabled={noClip || project.tracks.length < 2} label tone="primary">
            <MaterialCommunityIcons name="vector-intersection" size={ICON} color={STUDIO_COLORS.background} />
          </StudioButton>
        </StudioSection>
      </ScrollView>
    </View>
  );
}
