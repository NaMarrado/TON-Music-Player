import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_OWNER = 'NaMarrado';
export const REPOSITORY_NAME = 'TON-Music-Player';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}`;
export const RAW_MAIN_URL = `https://raw.githubusercontent.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/main`;
export const RELEASE_NOTES = 'TON checks GitHub Releases for updates.';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(SCRIPT_DIR, '..', '..');

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : join(REPO_ROOT, path);
}

export function readText(relativePath) {
  return readFileSync(resolveRepoPath(relativePath), 'utf8');
}

export function writeText(relativePath, contents) {
  writeFileSync(resolveRepoPath(relativePath), contents, 'utf8');
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function writeJson(relativePath, value) {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function parseSemver(version) {
  const match = String(version).trim().match(SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function normalizeVersion(version) {
  const parsed = parseSemver(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function compareVersions(left, right) {
  const leftParsed = parseSemver(left);
  const rightParsed = parseSemver(right);

  for (const key of ['major', 'minor', 'patch']) {
    if (leftParsed[key] > rightParsed[key]) {
      return 1;
    }
    if (leftParsed[key] < rightParsed[key]) {
      return -1;
    }
  }

  return 0;
}

export function bumpPatch(version) {
  const parsed = parseSemver(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

export function versionCodeFor(version) {
  const parsed = parseSemver(version);
  return parsed.major * 1_000_000 + parsed.minor * 1_000 + parsed.patch;
}

export function getCanonicalAssetNames(version) {
  normalizeVersion(version);

  return {
    macos: 'TON-macos.dmg',
    windows: 'TON-windows.exe',
    linux: 'TON-linux.AppImage',
    android: 'TON-android.apk',
  };
}

export function getReleaseUrl(version) {
  return `${REPOSITORY_URL}/releases/tag/v${normalizeVersion(version)}`;
}

export function getReleaseDownloadUrl(version, fileName) {
  const normalized = normalizeVersion(version);
  return `${REPOSITORY_URL}/releases/download/v${normalized}/${fileName}`;
}

export function buildUpdateManifest(version) {
  const normalized = normalizeVersion(version);
  const assetNames = getCanonicalAssetNames(normalized);

  return {
    version: normalized,
    detailsUrl: getReleaseUrl(normalized),
    notes: RELEASE_NOTES,
    desktop: {
      darwin: {
        url: getReleaseDownloadUrl(normalized, assetNames.macos),
        fileName: assetNames.macos,
      },
      win32: {
        url: getReleaseDownloadUrl(normalized, assetNames.windows),
        fileName: assetNames.windows,
      },
      linux: {
        url: getReleaseDownloadUrl(normalized, assetNames.linux),
        fileName: assetNames.linux,
      },
    },
    android: {
      url: getReleaseDownloadUrl(normalized, assetNames.android),
      fileName: assetNames.android,
    },
  };
}

export function getPackageVersion() {
  return normalizeVersion(readJson('package.json').version);
}

export function getLatestTaggedVersion() {
  let tags;
  try {
    tags = execFileSync('git', ['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .map((tag) => tag.trim())
      .filter(Boolean);
  } catch {
    return null;
  }

  let latest = null;
  for (const tag of tags) {
    const version = normalizeVersion(tag);
    if (!latest || compareVersions(version, latest) > 0) {
      latest = version;
    }
  }

  return latest;
}

export function getHighestKnownVersion({ includeTags = false } = {}) {
  const packageVersion = getPackageVersion();
  const taggedVersion = includeTags ? getLatestTaggedVersion() : null;

  if (taggedVersion && compareVersions(taggedVersion, packageVersion) > 0) {
    return taggedVersion;
  }

  return packageVersion;
}
