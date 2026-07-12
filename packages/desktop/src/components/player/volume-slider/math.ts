import {
  sliderPositionToVolumePercent,
  volumePercentToSliderPosition,
} from '@ton/core';

export function positionToVolume(pos: number): number {
  return sliderPositionToVolumePercent(pos);
}

export function volumeToPosition(vol: number): number {
  return volumePercentToSliderPosition(vol);
}
