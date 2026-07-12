import { supportsLoudnessBoost } from '../audio-settings/capabilities';
import {
  attachAudioBoost,
  releaseAudioBoost,
  setAudioBoostTargetGain,
} from '../native-audio-boost';
import { getAudioSessionId } from '../native-pitch';

let attachedSessionId = 0;
let attachPromise: Promise<boolean> | null = null;
let lastAppliedTargetGainMb: number | null = null;

export async function initializePlatformVolumeBoost(): Promise<boolean> {
  if (!supportsLoudnessBoost()) {
    return true;
  }

  return ensureAudioBoostAttached();
}

export async function applyPlatformVolumeBoost(targetGainMb: number): Promise<void> {
  if (!supportsLoudnessBoost()) {
    return;
  }

  if (targetGainMb === 0) {
    if (attachedSessionId !== 0 && lastAppliedTargetGainMb !== 0) {
      try {
        await setAudioBoostTargetGain(0);
        lastAppliedTargetGainMb = 0;
      } catch {
        // Session may no longer be valid; next attach will recover.
      }
    }
    return;
  }

  const attached = await ensureAudioBoostAttached();
  if (!attached || lastAppliedTargetGainMb === targetGainMb) {
    return;
  }

  try {
    await setAudioBoostTargetGain(targetGainMb);
    lastAppliedTargetGainMb = targetGainMb;
  } catch {
    // Session may be mid-transition; next playback init will reattach.
  }
}

async function ensureAudioBoostAttached(): Promise<boolean> {
  if (!supportsLoudnessBoost()) {
    return false;
  }

  if (attachPromise) {
    return attachPromise;
  }

  attachPromise = (async () => {
    const sessionId = await getAudioSessionId().catch(() => 0);
    if (!sessionId) {
      return false;
    }

    if (attachedSessionId === sessionId) {
      return true;
    }

    if (attachedSessionId !== 0) {
      try {
        await releaseAudioBoost();
      } catch {
        // Releasing an old session should not prevent a fresh attach attempt.
      }
      attachedSessionId = 0;
    }

    await attachAudioBoost(sessionId);
    attachedSessionId = sessionId;
    lastAppliedTargetGainMb = null;
    return true;
  })().finally(() => {
    attachPromise = null;
  });

  return attachPromise;
}
