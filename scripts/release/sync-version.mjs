#!/usr/bin/env node

import {
  bumpPatch,
  buildUpdateManifest,
  getHighestKnownVersion,
  getPackageVersion,
  normalizeVersion,
  readJson,
  readText,
  versionCodeFor,
  writeJson,
  writeText,
} from './release-config.mjs';

const VERSIONED_PACKAGES = [
  'package.json',
  'packages/core/package.json',
  'packages/desktop/package.json',
  'packages/mobile/package.json',
];

function parseArgs(argv) {
  const options = {
    bump: null,
    check: false,
    fromGitTags: false,
    skipManifest: false,
    version: null,
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--bump':
        options.bump = argv[index + 1] ?? null;
        index += 1;
        break;
      case '--check':
        options.check = true;
        break;
      case '--from-git-tags':
        options.fromGitTags = true;
        break;
      case '--skip-manifest':
        options.skipManifest = true;
        break;
      case '--version':
        options.version = argv[index + 1] ?? null;
        index += 1;
        break;
      case '--write':
        options.write = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.write && options.check) {
    throw new Error('Use either --write or --check, not both.');
  }

  if (!options.write && !options.check) {
    throw new Error('Pass --write to update files or --check to validate/dry-run.');
  }

  if (options.bump && options.bump !== 'patch') {
    throw new Error(`Unsupported bump mode: ${options.bump}`);
  }

  return options;
}

function replaceOrThrow(contents, pattern, replacement, label) {
  if (!pattern.test(contents)) {
    throw new Error(`Unable to update ${label}; expected pattern was not found.`);
  }
  return contents.replace(pattern, replacement);
}

function upsertObjectProperty(contents, objectKey, propertyKey, propertyLine, anchorPropertyKey) {
  const objectStart = contents.indexOf(`${objectKey}: {`);
  if (objectStart === -1) {
    throw new Error(`Unable to find ${objectKey} object in app.config.ts.`);
  }

  const objectEnd = contents.indexOf('\n  },', objectStart);
  if (objectEnd === -1) {
    throw new Error(`Unable to find end of ${objectKey} object in app.config.ts.`);
  }

  const before = contents.slice(0, objectStart);
  const objectBlock = contents.slice(objectStart, objectEnd);
  const after = contents.slice(objectEnd);
  const existingPattern = new RegExp(`^(\\s*)${propertyKey}:\\s*[^,]+,`, 'm');

  if (existingPattern.test(objectBlock)) {
    return `${before}${objectBlock.replace(existingPattern, propertyLine)}${after}`;
  }

  const anchorPattern = new RegExp(`^(\\s*)${anchorPropertyKey}:\\s*[^,]+,\\n`, 'm');
  const anchorMatch = objectBlock.match(anchorPattern);
  if (!anchorMatch) {
    throw new Error(`Unable to find ${anchorPropertyKey} anchor in ${objectKey} object.`);
  }

  return `${before}${objectBlock.replace(anchorPattern, `${anchorMatch[0]}${propertyLine}\n`)}${after}`;
}

function syncPackageVersions(version) {
  for (const relativePath of VERSIONED_PACKAGES) {
    const pkg = readJson(relativePath);
    pkg.version = version;
    writeJson(relativePath, pkg);
  }
}

function syncCoreVersion(version) {
  const relativePath = 'packages/core/src/utils/constants.ts';
  const contents = readText(relativePath);
  writeText(
    relativePath,
    replaceOrThrow(
      contents,
      /export const APP_VERSION = '[^']+';/,
      `export const APP_VERSION = '${version}';`,
      relativePath,
    ),
  );
}

function syncExpoConfig(version, buildNumber) {
  const relativePath = 'packages/mobile/app.config.ts';
  let contents = readText(relativePath);
  contents = replaceOrThrow(
    contents,
    /version: '[^']+',/,
    `version: '${version}',`,
    relativePath,
  );
  contents = upsertObjectProperty(
    contents,
    'android',
    'versionCode',
    `    versionCode: ${buildNumber},`,
    'package',
  );
  contents = upsertObjectProperty(
    contents,
    'ios',
    'buildNumber',
    `    buildNumber: '${buildNumber}',`,
    'bundleIdentifier',
  );
  writeText(relativePath, contents);
}

function syncIosNativeVersion(version, buildNumber) {
  const infoPlistPath = 'packages/mobile/ios/TON/Info.plist';
  const projectPath = 'packages/mobile/ios/TON.xcodeproj/project.pbxproj';

  let infoPlist = readText(infoPlistPath);
  infoPlist = replaceOrThrow(
    infoPlist,
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
    `$1${version}$2`,
    infoPlistPath,
  );
  infoPlist = replaceOrThrow(
    infoPlist,
    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/,
    `$1${buildNumber}$2`,
    infoPlistPath,
  );
  writeText(infoPlistPath, infoPlist);

  let project = readText(projectPath);
  project = project.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
  project = project.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  writeText(projectPath, project);
}

function syncGeneratedAndroidGradle(version, buildNumber) {
  const relativePath = 'packages/mobile/android/app/build.gradle';
  let contents;
  try {
    contents = readText(relativePath);
  } catch {
    return;
  }

  contents = contents
    .replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  writeText(relativePath, contents);
}

function extractOrThrow(contents, pattern, label) {
  const match = contents.match(pattern);
  if (!match) {
    throw new Error(`Unable to read ${label}; expected pattern was not found.`);
  }
  return match[1];
}

function assertEqual(actual, expected, label) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label} is ${actual}, expected ${expected}`);
  }
}

function assertFilesSynced(version, includeManifest) {
  const buildNumber = versionCodeFor(version);

  for (const relativePath of VERSIONED_PACKAGES) {
    assertEqual(readJson(relativePath).version, version, `${relativePath} version`);
  }

  assertEqual(
    extractOrThrow(readText('packages/core/src/utils/constants.ts'), /export const APP_VERSION = '([^']+)';/, 'APP_VERSION'),
    version,
    'APP_VERSION',
  );

  const appConfig = readText('packages/mobile/app.config.ts');
  assertEqual(
    extractOrThrow(appConfig, /version: '([^']+)',/, 'Expo version'),
    version,
    'Expo version',
  );
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

  const infoPlist = readText('packages/mobile/ios/TON/Info.plist');
  assertEqual(
    extractOrThrow(infoPlist, /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/, 'CFBundleShortVersionString'),
    version,
    'CFBundleShortVersionString',
  );
  assertEqual(
    extractOrThrow(infoPlist, /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/, 'CFBundleVersion'),
    buildNumber,
    'CFBundleVersion',
  );

  const project = readText('packages/mobile/ios/TON.xcodeproj/project.pbxproj');
  for (const projectVersion of project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)) {
    assertEqual(projectVersion[1], buildNumber, 'CURRENT_PROJECT_VERSION');
  }
  for (const marketingVersion of project.matchAll(/MARKETING_VERSION = ([^;]+);/g)) {
    assertEqual(marketingVersion[1], version, 'MARKETING_VERSION');
  }

  if (includeManifest) {
    const expectedManifest = JSON.stringify(buildUpdateManifest(version));
    const actualManifest = JSON.stringify(readJson('update.json'));
    if (expectedManifest !== actualManifest) {
      throw new Error(`update.json is not synchronized for version ${version}`);
    }
  }
}

function syncFiles(version, includeManifest) {
  const buildNumber = versionCodeFor(version);
  syncPackageVersions(version);
  syncCoreVersion(version);
  syncExpoConfig(version, buildNumber);
  syncIosNativeVersion(version, buildNumber);
  syncGeneratedAndroidGradle(version, buildNumber);
  if (includeManifest) {
    writeJson('update.json', buildUpdateManifest(version));
  }
}

function resolveTargetVersion(options) {
  const explicitVersion = options.version ? normalizeVersion(options.version) : null;
  const baseVersion = explicitVersion ?? getHighestKnownVersion({ includeTags: options.fromGitTags });

  if (options.bump === 'patch') {
    return bumpPatch(baseVersion);
  }

  return baseVersion;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentVersion = getPackageVersion();
  const targetVersion = resolveTargetVersion(options);
  const includeManifest = !options.skipManifest;

  if (options.write) {
    syncFiles(targetVersion, includeManifest);
    console.log(`Synced TON release version ${targetVersion}`);
    return;
  }

  assertFilesSynced(options.bump ? currentVersion : targetVersion, includeManifest);

  console.log(`Current version: ${currentVersion}`);
  console.log(`Target version: ${targetVersion}`);
}

main();
