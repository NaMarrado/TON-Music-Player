import { Platform } from 'react-native';

export * from './types';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro needs synchronous platform selection. */
const runtime = Platform.OS === 'ios'
  ? require('./ios')
  : require('./android');
/* eslint-enable @typescript-eslint/no-require-imports */

export const setupPlaybackRuntimePlayer = runtime.setupPlaybackRuntimePlayer as typeof import('./android').setupPlaybackRuntimePlayer;
export const configureDefaultPlaybackRuntimeOptions = runtime.configureDefaultPlaybackRuntimeOptions as typeof import('./android').configureDefaultPlaybackRuntimeOptions;
export const setPlaybackQueue = runtime.setPlaybackQueue as typeof import('./android').setPlaybackQueue;
export const replacePlaybackQueue = runtime.replacePlaybackQueue as typeof import('./android').replacePlaybackQueue;
export const addPlaybackTracks = runtime.addPlaybackTracks as typeof import('./android').addPlaybackTracks;
export const loadPlaybackTrack = runtime.loadPlaybackTrack as typeof import('./android').loadPlaybackTrack;
export const playPlayback = runtime.playPlayback as typeof import('./android').playPlayback;
export const pausePlayback = runtime.pausePlayback as typeof import('./android').pausePlayback;
export const stopPlayback = runtime.stopPlayback as typeof import('./android').stopPlayback;
export const seekPlayback = runtime.seekPlayback as typeof import('./android').seekPlayback;
export const setPlaybackVolume = runtime.setPlaybackVolume as typeof import('./android').setPlaybackVolume;
export const setPlaybackRepeatMode = runtime.setPlaybackRepeatMode as typeof import('./android').setPlaybackRepeatMode;
export const skipPlaybackIndex = runtime.skipPlaybackIndex as typeof import('./android').skipPlaybackIndex;
export const skipToNextPlayback = runtime.skipToNextPlayback as typeof import('./android').skipToNextPlayback;
export const skipToPreviousPlayback = runtime.skipToPreviousPlayback as typeof import('./android').skipToPreviousPlayback;
export const removeUpcomingPlaybackTracks = runtime.removeUpcomingPlaybackTracks as typeof import('./android').removeUpcomingPlaybackTracks;
export const getPlaybackPosition = runtime.getPlaybackPosition as typeof import('./android').getPlaybackPosition;
export const getPlaybackProgress = runtime.getPlaybackProgress as typeof import('./android').getPlaybackProgress;
export const getPlaybackState = runtime.getPlaybackState as typeof import('./android').getPlaybackState;
export const getActivePlaybackTrack = runtime.getActivePlaybackTrack as typeof import('./android').getActivePlaybackTrack;
export const getActivePlaybackTrackIndex = runtime.getActivePlaybackTrackIndex as typeof import('./android').getActivePlaybackTrackIndex;
export const usePlaybackRuntimeProgress = runtime.usePlaybackRuntimeProgress as typeof import('./android').usePlaybackRuntimeProgress;
export const usePlaybackRuntimeEvents = runtime.usePlaybackRuntimeEvents as typeof import('./android').usePlaybackRuntimeEvents;
export const addPlaybackRuntimeEventListener = runtime.addPlaybackRuntimeEventListener as typeof import('./android').addPlaybackRuntimeEventListener;
