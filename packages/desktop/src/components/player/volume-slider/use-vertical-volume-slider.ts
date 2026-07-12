import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  previewVolume,
  setVolume,
} from '../../../audio/playback-service';
import {
  MAX_VOLUME,
  WHEEL_STEP,
} from './constants';
import { positionToVolume } from './math';

export function useVerticalVolumeSlider(volume: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef(volume);
  const pendingVolumeRef = useRef(volume);
  const [isDragging, setIsDragging] = useState(false);

  volumeRef.current = volume;
  pendingVolumeRef.current = volume;

  const setVolumeFromY = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const rawPosition = 1 - ((clientY - rect.top) / rect.height);
    const position = Math.max(0, Math.min(1, rawPosition));
    const nextVolume = positionToVolume(position);

    pendingVolumeRef.current = nextVolume;
    previewVolume(nextVolume);
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setVolumeFromY(event.clientY);
    setIsDragging(true);

    const handleMove = (moveEvent: MouseEvent) => {
      setVolumeFromY(moveEvent.clientY);
    };

    const handleUp = () => {
      setIsDragging(false);
      setVolume(pendingVolumeRef.current);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [setVolumeFromY]);

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
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return {
    handleMouseDown,
    isDragging,
    trackRef,
  };
}
