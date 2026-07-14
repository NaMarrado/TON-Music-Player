export interface V2HistoryEvidence {
  revision: string | null;
  etag: string | null;
  mirroredEntityCount: number;
  activationMarkerPresent: boolean;
}

/** A missing V2 head is safe to bootstrap only when no V2 history exists. */
export function hasCloudV2History(evidence: V2HistoryEvidence): boolean {
  return Boolean(
    evidence.revision
    || evidence.etag
    || evidence.mirroredEntityCount > 0
    || evidence.activationMarkerPresent,
  );
}

export function conditionalManifestEtag(
  force: boolean,
  fullReconcile: boolean,
  outboxSize: number,
  etag: string | null,
): string | null {
  return !force && !fullReconcile && outboxSize === 0 ? etag : null;
}
