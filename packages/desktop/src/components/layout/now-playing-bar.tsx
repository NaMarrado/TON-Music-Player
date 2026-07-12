import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PlaybackControls } from '../player/playback-controls';
import { SeekBar } from '../player/seek-bar';
import { VolumeSlider } from '../player/volume-slider';
import { NowPlayingInfo } from '../player/now-playing-info';

interface NowPlayingBarProps {
  compact: boolean;
  onQueueToggle: () => void;
  queueOpen: boolean;
}

export function NowPlayingBar({ compact, onQueueToggle, queueOpen }: NowPlayingBarProps) {
  const { t } = useTranslation('components/layout/now-playing-bar');
  const navigate = useNavigate();
  const rightControls = (
    <>
      <PlayerRightBtn title={t('queue')} active={queueOpen} onClick={onQueueToggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </PlayerRightBtn>

      <PlayerRightBtn title={t('audioSettings')} onClick={() => navigate('/settings')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <circle cx="4" cy="12" r="2" />
          <circle cx="12" cy="10" r="2" />
          <circle cx="20" cy="14" r="2" />
        </svg>
      </PlayerRightBtn>
    </>
  );

  return (
    <div
      className="relative z-[100]"
      style={{
        gridColumn: '1 / 3',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        padding: compact ? '10px 16px 16px' : '18px 24px',
      }}
    >
      {compact ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <NowPlayingInfo compact />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {rightControls}
              <VolumeSlider compact />
            </div>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <PlaybackControls compact />
            </div>
            <div className="min-w-0 flex-1">
              <SeekBar compact />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="grid items-center min-w-0"
          style={{
            columnGap: '24px',
            gridTemplateColumns: '260px minmax(0, 1fr) 260px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <NowPlayingInfo />
          </div>

          <div
            className="min-w-0 flex flex-col items-center gap-[6px]"
            style={{ padding: '0 8px' }}
          >
            <PlaybackControls />
            <SeekBar />
          </div>

          <div
            className="flex items-center gap-[8px] justify-end"
            style={{ minWidth: 0 }}
          >
            {rightControls}
            <VolumeSlider />
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRightBtn({ title, active, onClick, children }: { title: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      className="player-right-btn flex items-center justify-center rounded-[6px] cursor-pointer relative"
      title={title}
      onClick={onClick}
      style={{
        width: '36px',
        height: '36px',
        color: active ? 'var(--white)' : 'var(--text-primary)',
        background: 'transparent',
        border: 'none',
        transition: 'var(--transition)',
      }}
    >
      {children}
    </button>
  );
}
