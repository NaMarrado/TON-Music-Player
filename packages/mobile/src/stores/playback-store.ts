import { create } from 'zustand';
import {
  DEFAULT_FREQUENCY_HZ,
  DEFAULT_VOLUME_PERCENT,
  EQ_PRESETS,
  type Track,
  type RepeatMode,
} from '@ton/core';

interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volumePercent: number;
  isMuted: boolean;
  loudnessNormEnabled: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  frequencyEnabled: boolean;
  frequencyHz: number;
  eqEnabled: boolean;
  eqBands: number[];
  eqPreset: string;
}

export const usePlaybackStore = create<PlaybackState>()(() => ({
  currentTrack: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volumePercent: DEFAULT_VOLUME_PERCENT,
  isMuted: false,
  loudnessNormEnabled: false,
  repeat: 'all',
  shuffle: false,
  frequencyEnabled: false,
  frequencyHz: DEFAULT_FREQUENCY_HZ,
  eqEnabled: false,
  eqBands: [...EQ_PRESETS.flat],
  eqPreset: 'flat',
}));
