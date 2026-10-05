import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PROTOCOL, clipBpm, clipDurationSec, updateTrack, type StudioProject, type StudioTrack } from '@ton/core';
import { NoCoverArt } from '../../components/ui/no-cover-art';
import { StudioButton } from './studio-controls';
import { camelotColor, formatClock } from './studio-format';
import { HEADER_WIDTH, LANE_HEIGHT } from './studio-geometry';
import { MuteIcon, SoloIcon, TrashIcon } from './studio-icons';
import { StudioClipItem } from './studio-clip';
import { StudioConfirm } from './studio-confirm';
import { editProject, removeLane, selectClip, selectTrack, useStudioStore } from './studio-store';

interface Props {
  track: StudioTrack;
  project: StudioProject;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  pxPerSec: number;
  viewLeft: number;
  viewWidth: number;
  totalWidth: number;
}

function StudioLaneView({ track, project, selectedClipId, selectedTrackId, pxPerSec, viewLeft, viewWidth, totalWidth }: Props) {
  const phase = useStudioStore((state) => state.assetPhase);
  const first = track.clips[0];
  const asset = first ? project.assets[first.assetId] : undefined;
  const bpm = first ? clipBpm(first, asset) : null;
  const coverUrl = asset?.coverPath ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(asset.coverPath)}` : null;
  const chosen = selectedTrackId === track.id;
  const loading = first ? phase[first.assetId] === 'loading' : false;
  const { t } = useTranslation('pages/studio');
  const [confirmAnchor, setConfirmAnchor] = useState<HTMLElement | null>(null);
  const closeConfirm = useCallback(() => setConfirmAnchor(null), []);

  return (
    <div className="studio-lane" data-selected={chosen || undefined} style={{ height: LANE_HEIGHT }}>
      <div className="studio-lane-head" style={{ width: HEADER_WIDTH }} onPointerDown={() => selectTrack(track.id)}>
        <div className="studio-lane-top">
          <div className="studio-cover">
            {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <NoCoverArt iconSize={16} />}
          </div>
          <div className="studio-lane-title">
            <strong title={asset?.title}>{asset?.title ?? ''}</strong>
            <span title={asset?.artist}>{asset?.artist ?? ''}</span>
          </div>
        </div>
        <div className="studio-lane-foot">
          <div className="studio-lane-chips" data-loading={loading || undefined}>
            {bpm !== null && <span className="studio-chip">{Math.round(bpm)}</span>}
            {asset?.key && <span className="studio-chip studio-key" style={{ background: camelotColor(asset.key) }}>{asset.key}</span>}
            {first && <span className="studio-chip studio-dim">{formatClock(clipDurationSec(first))}</span>}
          </div>
          <div className="studio-lane-actions">
            <StudioButton control="lane-mute" onClick={() => editProject((p) => updateTrack(p, track.id, { muted: !track.muted }))} active={track.muted}><MuteIcon /></StudioButton>
            <StudioButton control="lane-solo" onClick={() => editProject((p) => updateTrack(p, track.id, { solo: !track.solo }))} active={track.solo}><SoloIcon /></StudioButton>
            <StudioButton control="lane-remove" onClick={(event) => setConfirmAnchor(event.currentTarget)} active={confirmAnchor !== null}><TrashIcon /></StudioButton>
            {confirmAnchor && (
              <StudioConfirm
                anchor={confirmAnchor}
                id="lane-remove"
                text={t('removeConfirmText')}
                action={t('removeConfirmAction')}
                onConfirm={() => removeLane(track.id)}
                onClose={closeConfirm}
              />
            )}
          </div>
        </div>
      </div>
      <div
        className="studio-lane-body"
        data-lane-id={track.id}
        data-muted={track.muted || undefined}
        style={{ width: totalWidth }}
        onPointerDown={() => { selectClip(null); selectTrack(track.id); }}
      >
        {track.clips.map((clip) => {
          const clipAsset = project.assets[clip.assetId];
          return clipAsset ? (
            <StudioClipItem
              key={clip.id}
              clip={clip}
              asset={clipAsset}
              trackId={track.id}
              selected={selectedClipId === clip.id}
              pxPerSec={pxPerSec}
              viewLeft={viewLeft}
              viewWidth={viewWidth}
              laneOffsetPx={0}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

export const StudioLane = memo(StudioLaneView);
