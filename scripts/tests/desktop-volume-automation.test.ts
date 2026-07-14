import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scheduleVolumeGain,
  VOLUME_RAMP_SECONDS,
} from '../../packages/desktop/src/audio/engine/volume.ts';

type AutomationEvent = {
  kind: 'cancel' | 'hold' | 'set' | 'ramp';
  time: number;
  value?: number;
};

function createFakeAudioParam(): {
  events: AutomationEvent[];
  param: AudioParam;
} {
  const events: AutomationEvent[] = [];
  const param = {
    value: 0.75,
    cancelScheduledValues(time: number) {
      events.push({ kind: 'cancel', time });
      return this;
    },
    cancelAndHoldAtTime(time: number) {
      events.push({ kind: 'hold', time });
      return this;
    },
    setValueAtTime(value: number, time: number) {
      events.push({ kind: 'set', time, value });
      return this;
    },
    linearRampToValueAtTime(value: number, time: number) {
      events.push({ kind: 'ramp', time, value });
      return this;
    },
  } as unknown as AudioParam;

  return { events, param };
}

test('holds the interpolated value and ramps non-zero updates for 30 ms', () => {
  const { events, param } = createFakeAudioParam();
  scheduleVolumeGain(param, 0.25, 12);

  assert.deepEqual(events, [
    { kind: 'hold', time: 12 },
    { kind: 'ramp', time: 12 + VOLUME_RAMP_SECONDS, value: 0.25 },
  ]);
  assert.equal(VOLUME_RAMP_SECONDS, 0.03);
});

test('applies a zero target immediately without a ramp', () => {
  const { events, param } = createFakeAudioParam();
  scheduleVolumeGain(param, 0, 4.5);

  assert.deepEqual(events, [
    { kind: 'cancel', time: 4.5 },
    { kind: 'set', time: 4.5, value: 0 },
  ]);
});

test('applies explicit mute-style updates immediately without a ramp', () => {
  const { events, param } = createFakeAudioParam();
  scheduleVolumeGain(param, 0.5, 8, true);

  assert.deepEqual(events, [
    { kind: 'cancel', time: 8 },
    { kind: 'set', time: 8, value: 0.5 },
  ]);
});
