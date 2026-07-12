import { isVolumeBoosted } from '@ton/core';
import {
  VolumeBoostIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMuteIcon,
} from './icons';

interface VolumeIconProps {
  isMuted: boolean;
  volumePercent: number;
}

export function VolumeIcon({ isMuted, volumePercent }: VolumeIconProps) {
  if (isMuted) {
    return <VolumeMuteIcon />;
  }

  if (volumePercent < 50) {
    return <VolumeLowIcon />;
  }

  if (isVolumeBoosted(volumePercent)) {
    return <VolumeBoostIcon />;
  }

  return <VolumeHighIcon />;
}
