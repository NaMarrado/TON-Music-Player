import type { CloudStorageConfig, CloudStoragePublicConfig } from '@ton/core';
import {
  getDesktopCloudPublicConfig,
  saveDesktopCloudConfig,
} from './config';
import { DesktopR2Client } from './r2-client';
import { requireConfig } from './sync-common';

export function getCloudConfigForDesktop(): CloudStoragePublicConfig | null {
  return getDesktopCloudPublicConfig();
}

export function saveCloudConfigForDesktop(config: CloudStorageConfig): CloudStoragePublicConfig {
  return saveDesktopCloudConfig(config);
}

export async function testCloudConnectionForDesktop(config?: CloudStorageConfig): Promise<void> {
  const resolvedConfig = config ?? requireConfig();
  await new DesktopR2Client(resolvedConfig).testConnection();
}
