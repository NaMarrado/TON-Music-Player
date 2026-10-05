import { useTranslation } from 'react-i18next';
import {
  STUDIO_MAX_SPEED,
  STUDIO_MAX_TONE_DB,
  STUDIO_MAX_VOLUME,
  STUDIO_MIN_SPEED,
  STUDIO_NEW_CLIP_GAIN_DB,
  STUDIO_NEW_LANE_VOLUME,
  STUDIO_PRESETS,
  applyPreset,
  clipBpm,
  clipGainToLinear,
  connectClip,
  findClip,
  linearToClipGain,
  syncClipTempo,
  updateClip,
  updateTrack,
  updateTrackEffects,
  type StudioEffects,
  type StudioFadeCurve,
  type StudioPreset,
} from '@ton/core';
import { StudioButton, StudioSection, StudioSlider } from './studio-controls';
import {
  BassIcon, ConnectIcon, CurveLinearIcon, CurveSlowIcon, CurveSmoothIcon, DuplicateIcon, FilterIcon, LockIcon, MuffleIcon, ReverbIcon, ReverseIcon, ResetIcon,
  SlowedIcon, SpedUpIcon, SplitIcon, TempoIcon, TrashIcon, CrossfadeIcon,
} from './studio-icons';
import {
  connectSelectedClip, deleteSelectedClip, duplicateSelectedClip, editProject, setClipFade, setTransitionBars, setTransitionCurve, splitAtPlayhead,
  transitionIntoSelected, useStudioStore,
} from './studio-store';

const LOOK_ICONS: Record<StudioPreset, () => JSX.Element> = {
  slowed: SlowedIcon,
  slowedReverb: ReverbIcon,
  spedUp: SpedUpIcon,
  bassBoost: BassIcon,
  muffled: MuffleIcon,
  reset: ResetIcon,
};
/** Locale ids use dashes, the presets use camel case. */
const LOOK_IDS: Record<StudioPreset, string> = {
  slowed: 'look-slowed',
  slowedReverb: 'look-slowed-reverb',
  spedUp: 'look-sped-up',
  bassBoost: 'look-bass-boost',
  muffled: 'look-muffled',
  reset: 'look-reset',
};
const CURVES: Array<{ curve: StudioFadeCurve; control: string; Icon: () => JSX.Element }> = [
  { curve: 'equal-power', control: 'curve-smooth', Icon: CurveSmoothIcon },
  { curve: 'linear', control: 'curve-straight', Icon: CurveLinearIcon },
  { curve: 'exponential', control: 'curve-slow', Icon: CurveSlowIcon },
];
const BARS = [2, 4, 8, 16];
const LOG_MIN = Math.log2(40);
const LOG_MAX = Math.log2(16000);

const signed = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}${unit}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function StudioEdit() {
  const { t } = useTranslation('pages/studio');
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
    <div className="studio-edit">
      <div className="studio-edit-head" data-empty={noClip && noLane ? 'true' : undefined}>
        {asset ? (
          <>
            <strong title={asset.title}>{asset.title}</strong>
            <span title={asset.artist}>{asset.artist}</span>
          </>
        ) : (
          <span>{t(noLane ? 'editEmpty' : 'editLaneOnly')}</span>
        )}
      </div>
      <div className="studio-edit-scroll">
        <StudioSection id="clip" title={t('sections.clip')}>
          <div className="studio-row">
            <StudioButton control="clip-split" onClick={splitAtPlayhead} disabled={noLane} label><SplitIcon /></StudioButton>
            <StudioButton control="clip-join" onClick={connectSelectedClip} disabled={noClip || connectClip(project, clipId) === project} label><ConnectIcon /></StudioButton>
            <StudioButton control="clip-duplicate" onClick={duplicateSelectedClip} disabled={noClip} label><DuplicateIcon /></StudioButton>
            <StudioButton control="clip-delete" onClick={deleteSelectedClip} disabled={noClip} label><TrashIcon /></StudioButton>
          </div>
        </StudioSection>

        <StudioSection id="looks" title={t('sections.looks')}>
          <div className="studio-grid">
            {STUDIO_PRESETS.map((preset) => {
              const LookIcon = LOOK_ICONS[preset];
              return (
                <StudioButton key={preset} control={LOOK_IDS[preset]} onClick={() => editProject((p) => applyPreset(p, trackId, preset))} disabled={noLane} label>
                  <LookIcon />
                </StudioButton>
              );
            })}
          </div>
        </StudioSection>

        <StudioSection id="speed" title={t('sections.speed')}>
          <StudioSlider control="speed" value={clip?.speed ?? 1} min={STUDIO_MIN_SPEED} max={STUDIO_MAX_SPEED} step={0.01} neutral={1} resetTo={1} disabled={noClip} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => setClip({ speed }, 'speed')} />
          <StudioSlider control="pitch" value={clip?.semitones ?? 0} min={-24} max={24} step={1} neutral={0} resetTo={0} disabled={noClip} format={(v) => signed(v, '')} onChange={(semitones) => setClip({ semitones }, 'semitones')} />
          <div className="studio-row">
            <StudioButton control="keep-pitch" onClick={() => setClip({ pitchLock: !clip?.pitchLock }, 'lock')} active={clip?.pitchLock ?? false} disabled={noClip} label><LockIcon /></StudioButton>
            <StudioButton control="reverse" onClick={() => setClip({ reverse: !clip?.reverse }, 'reverse')} active={clip?.reverse ?? false} disabled={noClip} label><ReverseIcon /></StudioButton>
            <StudioButton
              control="match-tempo"
              onClick={() => editProject((p) => syncClipTempo(p, clipId, project.gridBpm ?? 0))}
              disabled={noClip || !project.gridBpm || !(clip && clipBpm(clip, asset))}
              label
            >
              <TempoIcon />
            </StudioButton>
          </div>
        </StudioSection>

        <StudioSection id="sound" title={t('sections.sound')}>
          <StudioSlider control="clip-volume" value={clipGainToLinear(clip?.gainDb ?? STUDIO_NEW_CLIP_GAIN_DB)} min={0} max={STUDIO_MAX_VOLUME} step={0.01} neutral={1} resetTo={clipGainToLinear(STUDIO_NEW_CLIP_GAIN_DB)} disabled={noClip} format={percent} onChange={(linear) => setClip({ gainDb: linearToClipGain(linear) }, 'gain')} />
          <StudioSlider control="lane-volume" value={track?.volume ?? STUDIO_NEW_LANE_VOLUME} min={0} max={STUDIO_MAX_VOLUME} step={0.01} neutral={1} resetTo={STUDIO_NEW_LANE_VOLUME} disabled={noLane} format={percent} onChange={(volume) => editProject((p) => updateTrack(p, trackId, { volume }), `vol:${trackId}`)} />
          <StudioSlider control="balance" value={effects?.pan ?? 0} min={-1} max={1} step={0.01} resetTo={0} disabled={noLane} format={(v) => (Math.abs(v) < 0.02 ? '0' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)} onChange={(pan) => setEffects({ pan }, 'pan')} />
          <StudioSlider control="bass" value={effects?.bassDb ?? 0} min={-STUDIO_MAX_TONE_DB} max={STUDIO_MAX_TONE_DB} step={0.5} neutral={0} resetTo={0} disabled={noLane} format={(v) => signed(v, ' dB')} onChange={(bassDb) => setEffects({ bassDb }, 'bass')} />
          <StudioSlider control="treble" value={effects?.trebleDb ?? 0} min={-STUDIO_MAX_TONE_DB} max={STUDIO_MAX_TONE_DB} step={0.5} neutral={0} resetTo={0} disabled={noLane} format={(v) => signed(v, ' dB')} onChange={(trebleDb) => setEffects({ trebleDb }, 'treble')} />
        </StudioSection>

        <StudioSection id="effects" title={t('sections.effects')}>
          <StudioSlider control="reverb" value={reverb.mix} min={0} max={1} step={0.01} resetTo={0} disabled={noLane} format={percent} onChange={(mix) => setEffects({ reverb: mix > 0 ? { ...reverb, mix } : null }, 'reverb')} />
          <StudioSlider control="reverb-size" value={reverb.size} min={0} max={1} step={0.05} disabled={noLane || !effects?.reverb} format={percent} onChange={(size) => setEffects({ reverb: { ...reverb, size } }, 'reverb-size')} />
          <StudioSlider control="reverb-dark" value={reverb.damping} min={0} max={1} step={0.05} disabled={noLane || !effects?.reverb} format={percent} onChange={(damping) => setEffects({ reverb: { ...reverb, damping } }, 'reverb-damp')} />
          <StudioSlider control="echo" value={echo.mix} min={0} max={1} step={0.01} resetTo={0} disabled={noLane} format={percent} onChange={(mix) => setEffects({ echo: mix > 0 ? { ...echo, mix } : null }, 'echo')} />
          <StudioSlider control="echo-time" value={echo.seconds} min={0.05} max={1.5} step={0.01} disabled={noLane || !effects?.echo} format={(v) => `${v.toFixed(2)} s`} onChange={(seconds) => setEffects({ echo: { ...echo, seconds } }, 'echo-time')} />
          <StudioSlider control="echo-repeats" value={echo.feedback} min={0} max={0.9} step={0.01} disabled={noLane || !effects?.echo} format={percent} onChange={(feedback) => setEffects({ echo: { ...echo, feedback } }, 'echo-fb')} />
          <div className="studio-row">
            <StudioButton control="filter-off" onClick={() => setEffects({ filter: null }, 'filter')} active={filter === null} disabled={noLane} label><FilterIcon /></StudioButton>
            <StudioButton control="filter-low" onClick={() => setEffects({ filter: { type: 'lowpass', hz: filter?.hz ?? 1500 } }, 'filter')} active={filter?.type === 'lowpass'} disabled={noLane} label><MuffleIcon /></StudioButton>
            <StudioButton control="filter-high" onClick={() => setEffects({ filter: { type: 'highpass', hz: filter?.hz ?? 400 } }, 'filter')} active={filter?.type === 'highpass'} disabled={noLane} label><BassIcon /></StudioButton>
          </div>
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

        <StudioSection id="fades" title={t('sections.fades')}>
          <StudioSlider control="fade-in" value={clip?.fadeIn.seconds ?? 0} min={0} max={maxFade} step={0.1} resetTo={0} disabled={noClip} format={(v) => `${v.toFixed(1)} s`} onChange={(seconds) => setClipFade(clipId, 'fadeIn', seconds)} />
          <StudioSlider control="fade-out" value={clip?.fadeOut.seconds ?? 0} min={0} max={maxFade} step={0.1} resetTo={0} disabled={noClip} format={(v) => `${v.toFixed(1)} s`} onChange={(seconds) => setClipFade(clipId, 'fadeOut', seconds)} />
        </StudioSection>

        <StudioSection id="transition" title={t('sections.transition')}>
          <div className="studio-segment" role="group">
            {BARS.map((bars) => (
              <StudioButton key={bars} control={`transition-bars-${bars}`} onClick={() => setTransitionBars(bars)} active={transitionBars === bars}>
                <span className="studio-label">{bars}</span>
              </StudioButton>
            ))}
          </div>
          <div className="studio-row">
            {CURVES.map(({ curve, control, Icon }) => (
              <StudioButton key={curve} control={control} onClick={() => setTransitionCurve(curve)} active={transitionCurve === curve} label><Icon /></StudioButton>
            ))}
          </div>
          <StudioButton control="transition-apply" onClick={() => transitionIntoSelected()} disabled={noClip || project.tracks.length < 2} label tone="primary"><CrossfadeIcon /></StudioButton>
        </StudioSection>
      </div>
    </div>
  );
}
