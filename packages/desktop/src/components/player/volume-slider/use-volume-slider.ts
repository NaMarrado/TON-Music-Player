import { useCallback, useEffect, useRef, useState } from 'react';
import {
  previewVolume,
  setVolume,
} from '../../../audio/playback-service';
import { MAX_VOLUME, WHEEL_STEP } from './constants';
import { positionToVolume } from './math';

export function useVolumeSlider(volume: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef(volume);
  const pendingVolumeRef = useRef(volume);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  volumeRef.current = volume;
  pendingVolumeRef.current = volume;

  const setVolumeFromX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextVolume = positionToVolume(pos);
    pendingVolumeRef.current = nextVolume;
    previewVolume(nextVolume);
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      setVolumeFromX(event.clientX);
      setIsDragging(true);

      const handleMove = (moveEvent: MouseEvent) => setVolumeFromX(moveEvent.clientX);
      const handleUp = () => {
        setIsDragging(false);
        setVolume(pendingVolumeRef.current);
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [setVolumeFromX],
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP;
      setVolume(Math.max(0, Math.min(MAX_VOLUME, volumeRef.current + delta)));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return {
    handleMouseDown,
    isDragging,
    isHovered,
    setIsHovered,
    trackRef,
  };
}
