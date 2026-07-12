import { useRef, useCallback, useEffect, memo } from 'react';
import { formatTime } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { seek, subscribePosition } from '../../audio/playback-service';

export const SeekBar = memo(function SeekBar({
  compact = false,
}: {
  compact?: boolean;
}) {
  const duration = usePlaybackStore((s) => s.duration);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const posTextRef = useRef<HTMLSpanElement>(null);
  const durTextRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef(0);

  // Direct DOM updates at 60fps — no React re-renders
  useEffect(() => {
    return subscribePosition((pos, dur) => {
      posRef.current = pos;
      if (progressRef.current && dur > 0) {
        progressRef.current.style.width = `${(pos / dur) * 100}%`;
      }
      if (posTextRef.current) {
        posTextRef.current.textContent = formatTime(pos * 1000);
      }
    });
  }, []);

  // Update duration text when track changes
  useEffect(() => {
    if (durTextRef.current) {
      durTextRef.current.textContent = formatTime(duration * 1000);
    }
  }, [duration]);

  const seekToPosition = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seek(pct * duration);
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      seekToPosition(e.clientX);

      const handleMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [seekToPosition],
  );

  return (
    <div
      className="flex items-center w-full"
      style={{ gap: compact ? '8px' : '10px', maxWidth: compact ? 'none' : '560px' }}
    >
      <span
        ref={posTextRef}
        className="font-medium"
        style={{
          fontSize: compact ? '0.72rem' : '0.75rem',
          color: 'var(--text-secondary)',
          minWidth: compact ? '32px' : '36px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatTime(0)}
      </span>

      <div
        ref={trackRef}
        className="seek-track flex-1 relative cursor-pointer flex items-center"
        onMouseDown={handleMouseDown}
        style={{ height: '20px' }}
      >
        <div className="w-full relative" style={{ height: '4px', background: 'var(--bg-hover)', borderRadius: '2px' }}>
          <div
            ref={progressRef}
            className="seek-progress h-full relative"
            style={{
              width: '0%',
              background: 'var(--white)',
              borderRadius: '2px',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      <span
        ref={durTextRef}
        className="font-medium text-right"
        style={{
          fontSize: compact ? '0.72rem' : '0.75rem',
          color: 'var(--text-secondary)',
          minWidth: compact ? '32px' : '36px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatTime(duration * 1000)}
      </span>
    </div>
  );
});
