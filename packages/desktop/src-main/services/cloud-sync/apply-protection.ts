export interface CloudApplyProtectionOutboxEntry {
  entity_type: 'track' | 'playlist' | 'library';
  local_id: number | null;
  operation: 'upsert' | 'delete' | 'reconcile';
  payload_json: string | null;
}

export interface CloudApplyIdentityLookup {
  trackHash(localId: number): string | null;
  playlistCloudId(localId: number): string | null;
}

export interface DesktopCloudApplyProtection {
  protectAll: boolean;
  trackHashes: Set<string>;
  playlistCloudIds: Set<string>;
}

function parseIdentity(payloadJson: string | null, key: string): string | null {
  if (!payloadJson) return null;
  try {
    const value = (JSON.parse(payloadJson) as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve both sides of a cloud identity change. The live row supplies the
 * current identity while a delete payload retains the identity that existed
 * before an update/delete removed it from SQLite.
 */
export function deriveDesktopCloudApplyProtection(
  entries: readonly CloudApplyProtectionOutboxEntry[],
  lookup: CloudApplyIdentityLookup,
): DesktopCloudApplyProtection {
  const protection: DesktopCloudApplyProtection = {
    protectAll: false,
    trackHashes: new Set<string>(),
    playlistCloudIds: new Set<string>(),
  };

  for (const entry of entries) {
    if (entry.entity_type === 'library' || entry.operation === 'reconcile') {
      protection.protectAll = true;
      continue;
    }
    if (entry.entity_type === 'track') {
      if (entry.local_id != null) {
        const currentHash = lookup.trackHash(entry.local_id);
        if (currentHash) protection.trackHashes.add(currentHash);
      }
      const previousHash = parseIdentity(entry.payload_json, 'content_hash_sha256');
      if (previousHash) protection.trackHashes.add(previousHash);
      continue;
    }
    if (entry.local_id != null) {
      const currentCloudId = lookup.playlistCloudId(entry.local_id);
      if (currentCloudId) protection.playlistCloudIds.add(currentCloudId);
    }
    const previousCloudId = parseIdentity(entry.payload_json, 'cloud_id');
    if (previousCloudId) protection.playlistCloudIds.add(previousCloudId);
  }

  return protection;
}
