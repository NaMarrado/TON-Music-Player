import {
  buildUpdateManifest,
  readJson,
  readText,
  versionCodeFor,
} from './release-config.mjs';
import { VERSIONED_PACKAGES } from './sync-version-files.mjs';

function extractOrThrow(contents, pattern, label) {
  const match = contents.match(pattern);
  if (!match) throw new Error(`Unable to read ${label}; expected pattern was not found.`);
  return match[1];
}

function assertEqual(actual, expected, label) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label} is ${actual}, expected ${expected}`);
  }
}

export function assertFilesSynced(version, includeManifest) {
  const buildNumber = versionCodeFor(version);
  for (const path of VERSIONED_PACKAGES) {
    assertEqual(readJson(path).version, version, `${path} version`);
  }
  assertEqual(
    extractOrThrow(
      readText('packages/core/src/utils/constants.ts'),
      /export const APP_VERSION = '([^']+)';/,
      'APP_VERSION',
    ),
    version,
    'APP_VERSION',
  );
  const appConfig = readText('packages/mobile/app.config.ts');
  assertEqual(extractOrThrow(appConfig, /version: '([^']+)',/, 'Expo version'), version, 'Expo version');
  assertEqual(
    extractOrThrow(appConfig, /versionCode: (\d+),/, 'Android versionCode'),
    buildNumber,
    'Android versionCode',
  );
  assertEqual(
    extractOrThrow(appConfig, /buildNumber: '([^']+)',/, 'iOS buildNumber'),
    buildNumber,
    'iOS buildNumber',
  );
  const info = readText('packages/mobile/ios/TON/Info.plist');
  assertEqual(
    extractOrThrow(
      info,
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
      'CFBundleShortVersionString',
    ),
    version,
    'CFBundleShortVersionString',
  );
  assertEqual(
    extractOrThrow(
      info,
      /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/,
      'CFBundleVersion',
    ),
    buildNumber,
    'CFBundleVersion',
  );
  const project = readText('packages/mobile/ios/TON.xcodeproj/project.pbxproj');
  for (const match of project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)) {
    assertEqual(match[1], buildNumber, 'CURRENT_PROJECT_VERSION');
  }
  for (const match of project.matchAll(/MARKETING_VERSION = ([^;]+);/g)) {
    assertEqual(match[1], version, 'MARKETING_VERSION');
  }
  if (includeManifest) {
    const expected = JSON.stringify(buildUpdateManifest(version));
    const actual = JSON.stringify(readJson('update.json'));
    if (expected !== actual) throw new Error(`update.json is not synchronized for version ${version}`);
  }
}
