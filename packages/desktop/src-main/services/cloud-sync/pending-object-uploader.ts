export interface PendingCloudObjectUpload {
  key: string;
  filePath: string;
  contentType: string;
  hash: string;
  progressGroup?: string;
}

export interface PendingCloudObjectUploadAdapter {
  headObject(key: string): Promise<boolean>;
  uploadObject(target: PendingCloudObjectUpload): Promise<'uploaded' | 'exists'>;
}

export interface PendingCloudObjectUploadResult {
  uploaded: number;
  skipped: number;
}

/**
 * Upload every requirement not confirmed by an earlier batch. The caller can
 * invoke this again after a CAS rebase; newly discovered objects are picked up
 * while objects already uploaded/confirmed in this cycle remain deduplicated.
 */
export async function uploadPendingCloudObjects(
  targets: readonly PendingCloudObjectUpload[],
  completedKeys: Set<string>,
  repairKeys: ReadonlySet<string>,
  adapter: PendingCloudObjectUploadAdapter,
  onProgress?: (
    current: number,
    total: number,
    result: PendingCloudObjectUploadResult,
  ) => void,
): Promise<PendingCloudObjectUploadResult> {
  const pending = targets.filter((target) => !completedKeys.has(target.key));
  const remainingByProgressGroup = new Map<string, number>();
  for (const target of pending) {
    if (!target.progressGroup) continue;
    remainingByProgressGroup.set(
      target.progressGroup,
      (remainingByProgressGroup.get(target.progressGroup) ?? 0) + 1,
    );
  }
  const progressTotal = remainingByProgressGroup.size;
  let progressCurrent = 0;
  const result: PendingCloudObjectUploadResult = { uploaded: 0, skipped: 0 };
  for (let index = 0; index < pending.length; index += 1) {
    const target = pending[index];
    if (repairKeys.has(target.key) && await adapter.headObject(target.key)) {
      completedKeys.add(target.key);
      result.skipped += 1;
    } else {
      const status = await adapter.uploadObject(target);
      completedKeys.add(target.key);
      if (status === 'uploaded') result.uploaded += 1;
      else result.skipped += 1;
    }
    if (target.progressGroup) {
      const remaining = (remainingByProgressGroup.get(target.progressGroup) ?? 1) - 1;
      if (remaining <= 0) {
        remainingByProgressGroup.delete(target.progressGroup);
        progressCurrent += 1;
      } else {
        remainingByProgressGroup.set(target.progressGroup, remaining);
      }
    }
    onProgress?.(progressCurrent, progressTotal, result);
  }
  return result;
}
