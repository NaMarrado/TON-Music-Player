/**
 * Pitch Shifter - true pitch shifting via SoundTouch AudioWorklet.
 *
 * Uses AudioWorkletNode (runs on dedicated audio thread, NOT the main thread)
 * to perform real-time pitch shifting without blocking UI.
 *
 * ratio = targetHz / 440  (e.g. 432/440 = 0.9818)
 * At ratio=1.0 the node should be bypassed entirely (see engine.ts).
 */

export interface PitchShifterHandle {
  node: AudioWorkletNode;
}

export function createPitchShifter(
  ctx: AudioContext,
  ratio: number,
): PitchShifterHandle {
  const node = new AudioWorkletNode(ctx, 'soundtouch-processor');
  node.parameters.get('pitch')!.value = ratio;
  return { node };
}

export function setPitchRatio(handle: PitchShifterHandle, ratio: number): void {
  handle.node.parameters.get('pitch')!.value = ratio;
}

export function destroyPitchShifter(handle: PitchShifterHandle): void {
  handle.node.disconnect();
}
