import {
  clampVolumePercent,
  formatVolumePercentLabel,
  sliderPositionToVolumePercent,
  volumePercentToSliderPosition,
} from '@ton/core';

const ZERO_SNAP_THRESHOLD_PERCENT = 0.5;

export function positionToVolume(pos: number): number {
  const volumePercent = sliderPositionToVolumePercent(pos);
  return volumePercent < ZERO_SNAP_THRESHOLD_PERCENT ? 0 : volumePercent;
}

export function volumeToPosition(vol: number): number {
  return volumePercentToSliderPosition(vol);
}

export function formatDesktopVolumePercentLabel(volumePercent: number): string {
  if (Number.isFinite(volumePercent) && volumePercent > 0 && volumePercent < 1) {
    return `${volumePercent.toFixed(1)}%`;
  }

  return formatVolumePercentLabel(clampVolumePercent(volumePercent));
}
