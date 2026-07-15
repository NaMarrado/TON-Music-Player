import type { CloudPlaylistEntry, CloudTrackEntry } from '@ton/core';

function normalizedTimestamp(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function earliestDownloadedAt(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  const values = [left, right].filter(
    (value): value is number => value != null && Number.isFinite(value) && value > 0,
  );
  return values.length > 0 ? Math.min(...values) : null;
}

/** Match the legacy V1 merge policy: newest updated_at wins and local wins ties. */
export function mergeV1BootstrapTrackEntry(
  remote: CloudTrackEntry,
  local: CloudTrackEntry,
): CloudTrackEntry {
  const preferred = normalizedTimestamp(local.updated_at) >= normalizedTimestamp(remote.updated_at)
    ? local
    : remote;
  return {
    ...preferred,
    downloaded_at: earliestDownloadedAt(remote.downloaded_at, local.downloaded_at),
  };
}

/** Playlist membership/order is part of the entry, so it follows the same policy. */
export function mergeV1BootstrapPlaylistEntry(
  remote: CloudPlaylistEntry,
  local: CloudPlaylistEntry,
): CloudPlaylistEntry {
  return normalizedTimestamp(local.updated_at) >= normalizedTimestamp(remote.updated_at)
    ? local
    : remote;
}
