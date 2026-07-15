export interface PendingCloudObjectUpload {
  key: string;
  filePath: string;
  contentType: string;
  hash: string;
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
    onProgress?.(index + 1, pending.length, result);
  }
  return result;
}
