import type { ExportManifest } from '@ton/core';
import { audioFormatFromExtension } from './media';

export interface PreparedImportTrack {
  contentHashSha256: string | null;
  downloadedAt: number | null;
  fileHash: string;
  filePath: string;
  fileSize: number | null;
  format: ReturnType<typeof audioFormatFromExtension>;
  inLibrary: boolean;
  metadata: ExportManifest['tracks'][number]['metadata'];
}

export interface ExistingImportTrackReconciliation {
  downloadedAt: number | null;
  trackId: number;
}

export function normalizeImportedDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function earliestDownloadedAt(
  current: number | null,
  incoming: number | null,
): number | null {
  if (current == null) return incoming;
  if (incoming == null) return current;
  return Math.min(current, incoming);
}
