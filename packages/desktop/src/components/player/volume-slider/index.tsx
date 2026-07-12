import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../../stores/playback-store';
import { PopupPanel } from './popup-panel';
import { useVolumePopup } from './use-volume-popup';
import { VolumeIcon } from './volume-icon';

export const VolumeSlider = memo(function VolumeSlider({
  compact: _compact = false,
}: {
  compact?: boolean;
}) {
  const { t } = useTranslation('components/player/volume-slider');
  const volumePercent = usePlaybackStore((state) => state.volumePercent);
  const isMuted = usePlaybackStore((state) => state.isMuted);
  const { open, rootRef, toggle } = useVolumePopup();

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
    >
      <button
        className="player-right-btn flex items-center justify-center rounded-[6px] cursor-pointer"
        title={t('volume')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
        style={{
          width: '36px',
          height: '36px',
          color: 'var(--text-primary)',
          background: 'transparent',
          border: 'none',
          transition: 'var(--transition)',
        }}
      >
        <VolumeIcon isMuted={isMuted} volumePercent={volumePercent} />
      </button>

      {open && (
        <PopupPanel isMuted={isMuted} volumePercent={volumePercent} />
      )}
    </div>
  );
});
