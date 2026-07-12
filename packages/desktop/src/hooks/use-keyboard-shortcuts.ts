/**
 * Global keyboard shortcuts for playback control.
 * Attached at app level so they work regardless of focus.
 */

import { useEffect } from 'react';
import {
  DESKTOP_KEYBOARD_STEP_PERCENT,
  MAX_VOLUME_PERCENT,
} from '@ton/core';
import { toggle, nextTrack, prevTrack, seek, setVolume, toggleMute } from '../audio/playback-service';
import { usePlaybackStore } from '../stores/playback-store';

const SEEK_STEP = 5; // seconds

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.code) {
        case 'Space': {
          e.preventDefault();
          toggle();
          break;
        }

        case 'ArrowRight': {
          if (e.ctrlKey || e.metaKey) {
            nextTrack();
          } else {
            const { position, duration } = usePlaybackStore.getState();
            if (duration > 0) seek(Math.min(position + SEEK_STEP, duration));
          }
          break;
        }

        case 'ArrowLeft': {
          if (e.ctrlKey || e.metaKey) {
            prevTrack();
          } else {
            const { position } = usePlaybackStore.getState();
            seek(Math.max(position - SEEK_STEP, 0));
          }
          break;
        }

        case 'ArrowUp': {
          e.preventDefault();
          const { volumePercent } = usePlaybackStore.getState();
          setVolume(Math.min(volumePercent + DESKTOP_KEYBOARD_STEP_PERCENT, MAX_VOLUME_PERCENT));
          break;
        }

        case 'ArrowDown': {
          e.preventDefault();
          const { volumePercent } = usePlaybackStore.getState();
          setVolume(Math.max(volumePercent - DESKTOP_KEYBOARD_STEP_PERCENT, 0));
          break;
        }

        case 'KeyM': {
          toggleMute();
          break;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
