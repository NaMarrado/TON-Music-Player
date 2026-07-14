import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStoredVolumePercent,
  volumePercentToDesktopGain,
  volumePercentToNormalGain,
} from '../../packages/core/src/utils/volume-law.ts';
import {
  formatDesktopVolumePercentLabel,
  positionToVolume,
  volumeToPosition,
} from '../../packages/desktop/src/components/player/volume-slider/math.ts';

function assertAlmostEqual(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('maps the normal volume range through the zero-terminated perceptual curve', () => {
  const cases = [
    [0, 0],
    [0.1, 0.00004662414422621418],
    [1, 0.00047604593990807685],
    [5, 0.0026154081999410837],
    [10, 0.005908012045061754],
    [50, 0.09090909090909091],
    [100, 1],
  ] as const;

  for (const [volumePercent, expectedGain] of cases) {
    assertAlmostEqual(volumePercentToNormalGain(volumePercent), expectedGain);
  }
});

test('keeps the existing +12 dB boost range above 100 percent', () => {
  assert.equal(volumePercentToDesktopGain(100), 1);
  assertAlmostEqual(volumePercentToDesktopGain(200), 3.9810717055349722);
});

test('volume gain is monotonic across the full 0 to 200 percent range', () => {
  let previous = volumePercentToDesktopGain(0);
  for (let step = 1; step <= 2_000; step += 1) {
    const current = volumePercentToDesktopGain(step / 10);
    assert.ok(current > previous, `gain did not increase at ${step / 10}%`);
    previous = current;
  }
});

test('legacy normal-gain migration round-trips the new curve', () => {
  for (const volumePercent of [0, 0.1, 1, 5, 10, 50, 100]) {
    const gain = volumePercentToDesktopGain(volumePercent);
    const resolved = resolveStoredVolumePercent(null, String(gain));

    assert.equal(resolved.source, 'legacy_volume');
    assert.equal(resolved.shouldPersist, true);
    assert.equal(resolved.volumePercent, volumePercent);
  }
});

test('legacy stored gains preserve their acoustic level after migration', () => {
  for (const legacyGain of [0, 0.01, 0.1, 0.5, 1]) {
    const resolved = resolveStoredVolumePercent(null, String(legacyGain));
    const migratedGain = volumePercentToDesktopGain(resolved.volumePercent);

    assertAlmostEqual(migratedGain, legacyGain, 0.002);
  }
});

test('desktop slider snaps only values below 0.5 percent to real zero', () => {
  assert.equal(positionToVolume(volumeToPosition(0.4)), 0);
  assert.equal(positionToVolume(volumeToPosition(0.5)), 0.5);
  assert.equal(positionToVolume(volumeToPosition(1)), 1);
});

test('desktop labels distinguish exact zero from low non-zero values', () => {
  assert.equal(formatDesktopVolumePercentLabel(0), '0%');
  assert.equal(formatDesktopVolumePercentLabel(0.04), '0.0%');
  assert.equal(formatDesktopVolumePercentLabel(0.1), '0.1%');
  assert.equal(formatDesktopVolumePercentLabel(0.9), '0.9%');
  assert.equal(formatDesktopVolumePercentLabel(1), '1%');
  assert.equal(formatDesktopVolumePercentLabel(125), '100% +25%');
});
