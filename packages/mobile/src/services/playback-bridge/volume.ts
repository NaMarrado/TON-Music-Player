import {
  clampVolumePercent,
  MOBILE_VOLUME_BUTTON_STEP_PERCENT,
  volumePercentToDesktopGain,
} from '@ton/core';
import { Platform } from 'react-native';
import { usePlaybackStore } from '../../stores/playback-store';
import { setSetting } from '../db-queries';
import {
  applyPlatformVolumeBoost,
  initializePlatformVolumeBoost,
} from './boost-runtime';
import { setPlaybackVolume } from '../playback-runtime';
import {
  logVolumeDebug,
  logVolumePreview,
} from '../volume-debug';

let desiredOutputState: QueuedVolumeOutput | null = null;
let outputProcessor: Promise<void> | null = null;
let nextOutputVersion = 0;
let appliedOutputVersion = 0;
const outputWaiters = new Map<number, Array<() => void>>();
let lastAppliedTrackGain: number | null = null;

const BOOST_PREVIEW_PERCENT_STEP = 1;
const TRACK_GAIN_EPSILON = 0.0001;

type QueuedVolumeOutput = {
  version: number;
  volumePercent: number;
  isMuted: boolean;
};

export async function setVolume(value: number): Promise<void> {
  const clamped = setCommittedVolumeState(value);
  await queueVolumeOutput(clamped, false);
  logVolumeDebug('commit', { volumePercent: clamped });
  setSetting('volume_percent', String(clamped)).catch(() => {});
}

export async function increaseVolumeByStep(
  stepPercent = MOBILE_VOLUME_BUTTON_STEP_PERCENT,
): Promise<void> {
  const { volumePercent } = usePlaybackStore.getState();
  await setVolume(volumePercent + stepPercent);
}

export async function decreaseVolumeByStep(
  stepPercent = MOBILE_VOLUME_BUTTON_STEP_PERCENT,
): Promise<void> {
  const { volumePercent } = usePlaybackStore.getState();
  await setVolume(volumePercent - stepPercent);
}

export function previewVolume(value: number): void {
  const clamped = normalizePreviewVolumePercent(value);
  logVolumePreview(clamped);
  void queueVolumeOutput(clamped, false);
}

export async function toggleMute(): Promise<void> {
  const { isMuted, volumePercent } = usePlaybackStore.getState();
  const nextMuted = !isMuted;
  usePlaybackStore.setState({ isMuted: nextMuted });
  logVolumeDebug(nextMuted ? 'mute:on' : 'mute:off', { volumePercent });
  await queueVolumeOutput(volumePercent, nextMuted);
}

export async function restoreVolumePercent(value: number): Promise<void> {
  const clamped = clampVolumePercent(value);
  usePlaybackStore.setState({ volumePercent: clamped, isMuted: false });
  logVolumeDebug('restore:apply', { volumePercent: clamped });
  await queueVolumeOutput(clamped, false);
}

export async function syncVolumeOutputToState(): Promise<void> {
  const { volumePercent, isMuted } = usePlaybackStore.getState();
  await queueVolumeOutput(volumePercent, isMuted);
}

export async function initializeVolumeBoost(): Promise<boolean> {
  const attached = await initializePlatformVolumeBoost();
  if (!attached) {
    return false;
  }

  const { volumePercent, isMuted } = usePlaybackStore.getState();
  logVolumeDebug('boost:init', {
    attached,
    volumePercent,
    isMuted,
  });
  await queueVolumeOutput(volumePercent, isMuted);
  return true;
}

function queueVolumeOutput(volumePercent: number, isMuted: boolean): Promise<void> {
  const request: QueuedVolumeOutput = {
    version: ++nextOutputVersion,
    volumePercent: clampVolumePercent(volumePercent),
    isMuted,
  };

  desiredOutputState = request;

  if (!outputProcessor) {
    outputProcessor = processQueuedVolumeOutput();
  }

  if (appliedOutputVersion >= request.version) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const waiters = outputWaiters.get(request.version);
    if (waiters) {
      waiters.push(resolve);
      return;
    }
    outputWaiters.set(request.version, [resolve]);
  });
}

async function processQueuedVolumeOutput(): Promise<void> {
  try {
    while (desiredOutputState) {
      const request = desiredOutputState;
      desiredOutputState = null;
      await applyVolumeOutput(request.volumePercent, request.isMuted);
      appliedOutputVersion = request.version;
      resolveAppliedWaiters();
    }
  } finally {
    outputProcessor = null;
    if (desiredOutputState) {
      outputProcessor = processQueuedVolumeOutput();
    }
  }
}

function resolveAppliedWaiters(): void {
  for (const [version, waiters] of outputWaiters) {
    if (version > appliedOutputVersion) {
      continue;
    }

    outputWaiters.delete(version);
    for (const resolve of waiters) {
      resolve();
    }
  }
}

async function applyVolumeOutput(volumePercent: number, isMuted: boolean): Promise<void> {
  const clamped = clampVolumePercent(volumePercent);
  const { loudnessGainDb, targetGainMb, totalGain, trackGain } = resolveDesiredOutput(clamped, isMuted);
  logVolumeDebug('apply', {
    volumePercent: clamped,
    isMuted,
    loudnessGainDb,
    trackGain,
    targetGainMb,
    totalGain,
  });

  if (shouldApplyTrackGain(trackGain)) {
    try {
      await setPlaybackVolume(trackGain);
      lastAppliedTrackGain = trackGain;
    } catch {
      // Persisted volume still wins even if the player is not ready yet.
    }
  }

  await applyPlatformVolumeBoost(targetGainMb);
}

function resolveDesiredOutput(volumePercent: number, isMuted: boolean): {
  loudnessGainDb: number;
  targetGainMb: number;
  totalGain: number;
  trackGain: number;
} {
  if (isMuted) {
    return {
      loudnessGainDb: 0,
      targetGainMb: 0,
      totalGain: 0,
      trackGain: 0,
    };
  }

  const loudnessGainDb = getEffectiveLoudnessGainDb();
  const totalGain = volumePercentToDesktopGain(volumePercent) * dbToGain(loudnessGainDb);

  if (!Number.isFinite(totalGain) || totalGain <= 0) {
    return {
      loudnessGainDb,
      targetGainMb: 0,
      totalGain: 0,
      trackGain: 0,
    };
  }

  return {
    loudnessGainDb,
    targetGainMb: totalGain > 1 ? gainToMillibels(totalGain) : 0,
    totalGain,
    trackGain: Math.min(1, totalGain),
  };
}

function setCommittedVolumeState(value: number): number {
  const clamped = clampVolumePercent(value);
  usePlaybackStore.setState({ volumePercent: clamped, isMuted: false });
  return clamped;
}

function normalizePreviewVolumePercent(value: number): number {
  const clamped = clampVolumePercent(value);
  if (clamped <= 100) {
    return clamped;
  }

  return clampVolumePercent(
    Math.round(clamped / BOOST_PREVIEW_PERCENT_STEP) * BOOST_PREVIEW_PERCENT_STEP,
  );
}

function shouldApplyTrackGain(nextTrackGain: number): boolean {
  if (lastAppliedTrackGain == null) {
    return true;
  }

  return Math.abs(lastAppliedTrackGain - nextTrackGain) > TRACK_GAIN_EPSILON;
}

function getEffectiveLoudnessGainDb(): number {
  if (Platform.OS === 'ios') {
    return 0;
  }
  const { currentTrack, loudnessNormEnabled } = usePlaybackStore.getState();
  if (!loudnessNormEnabled) {
    return 0;
  }

  return currentTrack?.loudness_gain ?? 0;
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function gainToMillibels(gain: number): number {
  return Math.round((20 * Math.log10(gain)) * 100);
}
