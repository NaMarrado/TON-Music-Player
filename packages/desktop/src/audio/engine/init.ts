import { createEqualizer } from '../equalizer-node';
import { getEngineState } from './state';

export function initAudioEngine(): Promise<void> {
  const state = getEngineState();
  if (state.initPromise) {
    return state.initPromise;
  }

  state.initPromise = doInit();
  return state.initPromise;
}

async function doInit(): Promise<void> {
  const state = getEngineState();
  state.ctx = new AudioContext();

  const workletUrl = new URL('./soundtouch-worklet.js', window.location.href).toString();
  await state.ctx.audioWorklet.addModule(workletUrl);

  state.headGain = state.ctx.createGain();
  state.headGain.gain.value = 1;

  state.eq = createEqualizer(state.ctx);
  state.loudnessGain = state.ctx.createGain();
  state.loudnessGain.gain.value = 1;

  state.limiter = state.ctx.createDynamicsCompressor();
  state.limiter.threshold.value = -1;
  state.limiter.ratio.value = 20;
  state.limiter.attack.value = 0.003;
  state.limiter.release.value = 0.25;
  state.limiter.knee.value = 0;

  state.volumeGain = state.ctx.createGain();
  state.volumeGain.gain.value = 1;

  state.headGain.connect(state.eq.input);
  state.eq.output.connect(state.loudnessGain);
  state.loudnessGain.connect(state.volumeGain);
  state.volumeGain.connect(state.limiter);
  state.limiter.connect(state.ctx.destination);
  state.chainInput = state.headGain;
}
