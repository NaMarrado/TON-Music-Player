import { memo } from 'react';
import { isVolumeBoosted } from '@ton/core';
import { useTranslation } from 'react-i18next';
import { toggleMute } from '../../../audio/playback-service';
import { NORMAL_ZONE } from './constants';
import { formatDesktopVolumePercentLabel, volumeToPosition } from './math';
import { useVerticalVolumeSlider } from './use-vertical-volume-slider';
import { VolumeIcon } from './volume-icon';

interface PopupPanelProps {
  isMuted: boolean;
  volumePercent: number;
}

export const PopupPanel = memo(function PopupPanel({ isMuted, volumePercent }: PopupPanelProps) {
  const { t } = useTranslation('components/player/volume-slider');
  const { handleMouseDown, trackRef } = useVerticalVolumeSlider(volumePercent);
  const fillPct = volumeToPosition(volumePercent) * 100;
  const isAmplified = isVolumeBoosted(volumePercent);

  return (
    <div
      className="absolute flex flex-col items-center gap-3"
      style={{
        right: 0,
        bottom: 'calc(100% + 10px)',
        width: '84px',
        padding: '12px 10px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.42)',
      }}
    >
      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--white)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {formatDesktopVolumePercentLabel(volumePercent)}
      </span>

      <div
        ref={trackRef}
        className="relative cursor-pointer"
        onMouseDown={handleMouseDown}
        style={{
          width: '8px',
          height: '148px',
          borderRadius: '999px',
          background: 'var(--bg-hover)',
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            left: '-3px',
            bottom: `${NORMAL_ZONE * 100}%`,
            width: '14px',
            height: '1px',
            background: 'var(--text-secondary)',
            opacity: 0.45,
            borderRadius: '999px',
          }}
        />

        <div
          className="absolute left-0 bottom-0"
          style={{
            width: '100%',
            height: `${fillPct}%`,
            borderRadius: '999px',
            background: isAmplified
              ? 'linear-gradient(180deg, var(--text-secondary) 0%, var(--white) 40%, var(--white) 100%)'
              : 'var(--white)',
          }}
        />

        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            bottom: `calc(${fillPct}% - 8px)`,
            width: '16px',
            height: '16px',
            borderRadius: '999px',
            border: '2px solid var(--bg-surface)',
            background: 'var(--white)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.34)',
            transform: 'translateX(-50%)',
          }}
        />
      </div>

      <button
        className="player-right-btn flex items-center justify-center rounded-[10px] cursor-pointer"
        title={isMuted ? t('unmute') : t('mute')}
        onClick={toggleMute}
        style={{
          width: '40px',
          height: '40px',
          color: 'var(--text-primary)',
          background: 'transparent',
          border: '1px solid var(--border)',
        }}
      >
        <VolumeIcon isMuted={isMuted} volumePercent={volumePercent} />
      </button>
    </div>
  );
});
