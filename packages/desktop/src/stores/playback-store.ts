import { create } from 'zustand';
import {
  DEFAULT_FREQUENCY_HZ,
  DEFAULT_VOLUME_PERCENT,
  EQ_PRESETS,
  type Track,
  type RepeatMode,
} from '@ton/core';

export interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volumePercent: number;
  isMuted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  frequencyHz: number;
  loudnessNormEnabled: boolean;
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
  repeat: 'all',
  shuffle: false,
  frequencyHz: DEFAULT_FREQUENCY_HZ,
  loudnessNormEnabled: false,
  eqEnabled: false,
  eqBands: [...EQ_PRESETS.flat],
  eqPreset: 'flat',
}));
