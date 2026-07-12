import { Platform } from 'react-native';
import type { AppUpdatePlatform } from '@ton/core';

export function getMobileUpdatePlatform(): AppUpdatePlatform {
  if (Platform.OS === 'android') {
    return 'android';
  }

  if (Platform.OS === 'ios') {
    return 'ios';
  }

  return 'unknown';
}

export function isAndroidMobileRuntime(): boolean {
  return getMobileUpdatePlatform() === 'android';
}
