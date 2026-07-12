import * as FileSystem from 'expo-file-system';

const DOCUMENTS_SEGMENT = '/Documents/';

export function getCurrentDocumentsDirectory(): string | null {
  return FileSystem.documentDirectory ?? null;
}

export function buildCurrentSandboxPath(originalPath: string): string | null {
  const currentDocumentsDirectory = getCurrentDocumentsDirectory();
  if (!currentDocumentsDirectory) {
    return null;
  }

  if (originalPath.startsWith(currentDocumentsDirectory)) {
    return null;
  }

  const markerIndex = originalPath.indexOf(DOCUMENTS_SEGMENT);
  if (markerIndex === -1) {
    return null;
  }

  const relativeSuffix = originalPath.slice(markerIndex + DOCUMENTS_SEGMENT.length);
  if (!relativeSuffix) {
    return null;
  }

  return `${currentDocumentsDirectory}${relativeSuffix}`;
}

export async function shouldRewriteSandboxPath(originalPath: string | null | undefined): Promise<string | null> {
  if (!originalPath) {
    return null;
  }

  const candidatePath = buildCurrentSandboxPath(originalPath);
  if (!candidatePath || candidatePath === originalPath) {
    return null;
  }

  const candidateInfo = await FileSystem.getInfoAsync(candidatePath).catch(() => ({ exists: false }));
  if (!candidateInfo.exists) {
    return null;
  }

  return candidatePath;
}
