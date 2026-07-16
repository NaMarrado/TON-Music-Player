export function resolveAvailablePlaylistTrackIds(
  trackHashes: readonly string[],
  trackIdByHash: ReadonlyMap<string, number>,
): number[] {
  const trackIds: number[] = [];
  for (const hash of trackHashes) {
    const trackId = trackIdByHash.get(hash);
    if (trackId != null) trackIds.push(trackId);
  }
  return trackIds;
}
