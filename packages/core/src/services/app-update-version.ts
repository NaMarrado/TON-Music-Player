function normalizeVersion(version: string): string {
  const trimmed = version.trim().replace(/^v/i, '');
  const [main, prerelease] = trimmed.split('-', 2);
  const numericParts = main.split('.');

  if (numericParts.length === 0 || numericParts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Invalid version: ${version}`);
  }

  const normalizedMain = numericParts.map((part) => String(Number(part))).join('.');
  return prerelease ? `${normalizedMain}-${prerelease}` : normalizedMain;
}

export function normalizeAppVersion(version: string): string {
  return normalizeVersion(version);
}

export function compareVersions(left: string, right: string): number {
  const normalizedLeft = normalizeVersion(left);
  const normalizedRight = normalizeVersion(right);
  const [leftMain, leftPrerelease = ''] = normalizedLeft.split('-', 2);
  const [rightMain, rightPrerelease = ''] = normalizedRight.split('-', 2);
  const leftParts = leftMain.split('.').map(Number);
  const rightParts = rightMain.split('.').map(Number);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  if (!leftPrerelease && rightPrerelease) {
    return 1;
  }

  if (leftPrerelease && !rightPrerelease) {
    return -1;
  }

  if (leftPrerelease > rightPrerelease) {
    return 1;
  }

  if (leftPrerelease < rightPrerelease) {
    return -1;
  }

  return 0;
}
