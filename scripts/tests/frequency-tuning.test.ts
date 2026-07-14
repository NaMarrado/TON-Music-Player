import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_FREQUENCY_HZ,
  MAX_FREQUENCY_HZ,
  PERSISTED_SETTING_DEFAULTS,
  PITCH_REFERENCE_FREQUENCY_HZ,
  SETTING_DEFAULTS,
  getEffectiveFrequencyPitchRatio,
  resolveStoredFrequencyEnabled,
} from '../../packages/core/src/index.ts';

test('keeps 432 Hz selected while frequency tuning defaults to off', () => {
  assert.equal(DEFAULT_FREQUENCY_HZ, 432);
  assert.equal(SETTING_DEFAULTS.frequency_hz, DEFAULT_FREQUENCY_HZ);
  assert.equal(PERSISTED_SETTING_DEFAULTS.frequency_hz, DEFAULT_FREQUENCY_HZ);
  assert.equal(SETTING_DEFAULTS.frequency_enabled, false);
  assert.equal(PERSISTED_SETTING_DEFAULTS.frequency_enabled, false);
});

test('restores frequency tuning as enabled only from canonical true values', () => {
  assert.deepEqual(resolveStoredFrequencyEnabled('true'), {
    frequencyEnabled: true,
    shouldPersist: false,
  });
  assert.deepEqual(resolveStoredFrequencyEnabled(true), {
    frequencyEnabled: true,
    shouldPersist: false,
  });
  assert.deepEqual(resolveStoredFrequencyEnabled('false'), {
    frequencyEnabled: false,
    shouldPersist: false,
  });
  assert.deepEqual(resolveStoredFrequencyEnabled(false), {
    frequencyEnabled: false,
    shouldPersist: false,
  });
});

test('migrates missing or non-canonical frequency flags to disabled', () => {
  for (const value of [null, undefined, 'TRUE', '1', 1, 0, ' true ']) {
    assert.deepEqual(resolveStoredFrequencyEnabled(value), {
      frequencyEnabled: false,
      shouldPersist: true,
    });
  }
});

test('uses unity pitch while disabled and the normalized frequency ratio while enabled', () => {
  assert.equal(getEffectiveFrequencyPitchRatio(432, false), 1);
  assert.equal(getEffectiveFrequencyPitchRatio(528, false), 1);
  assert.equal(getEffectiveFrequencyPitchRatio(PITCH_REFERENCE_FREQUENCY_HZ, true), 1);
  assert.equal(
    getEffectiveFrequencyPitchRatio(DEFAULT_FREQUENCY_HZ, true),
    DEFAULT_FREQUENCY_HZ / PITCH_REFERENCE_FREQUENCY_HZ,
  );
  assert.equal(
    getEffectiveFrequencyPitchRatio(Number.POSITIVE_INFINITY, true),
    DEFAULT_FREQUENCY_HZ / PITCH_REFERENCE_FREQUENCY_HZ,
  );
  assert.equal(
    getEffectiveFrequencyPitchRatio(MAX_FREQUENCY_HZ + 100, true),
    MAX_FREQUENCY_HZ / PITCH_REFERENCE_FREQUENCY_HZ,
  );
});
