import Constants from 'expo-constants';
import { APP_VERSION, TON_RELEASES_URL } from '@ton/core';
import type { UpdateManifest } from '@ton/core';
import { getMobileUpdatePlatform } from './app-update-platform';

function getSimulatedManifest(): UpdateManifest | null {
  const simulationEnabled = process.env.EXPO_PUBLIC_TON_ENABLE_UPDATE_SIMULATION?.trim() === '1';
  if (!simulationEnabled) {
    return null;
  }

  const simulatedVersion = process.env.EXPO_PUBLIC_TON_SIMULATE_UPDATE_VERSION?.trim();
  if (!simulatedVersion) {
    return null;
  }

  const manifest: UpdateManifest = {
    version: simulatedVersion,
    detailsUrl: process.env.EXPO_PUBLIC_TON_SIMULATE_UPDATE_URL?.trim() || TON_RELEASES_URL,
    notes: 'Simulated GitHub release feed',
  };

  if (getMobileUpdatePlatform() === 'android') {
    manifest.android = {
      url: 'https://example.invalid/ton-android-update-simulation',
      fileName: `TON-${simulatedVersion}-android-update-simulation.txt`,
    };
  }

  return manifest;
}

export function getMobileAppVersion(): string {
  return Constants.expoConfig?.version ?? APP_VERSION;
}

export function getFallbackUpdateManifest(): UpdateManifest | null {
  return getSimulatedManifest();
}
