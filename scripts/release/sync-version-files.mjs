import {
  buildUpdateManifest,
  readJson,
  readText,
  versionCodeFor,
  writeJson,
  writeText,
} from './release-config.mjs';

export const VERSIONED_PACKAGES = [
  'package.json',
  'packages/core/package.json',
  'packages/desktop/package.json',
  'packages/mobile/package.json',
];

function replaceOrThrow(contents, pattern, replacement, label) {
  if (!pattern.test(contents)) {
    throw new Error(`Unable to update ${label}; expected pattern was not found.`);
  }
  return contents.replace(pattern, replacement);
}

function upsertObjectProperty(contents, objectKey, propertyKey, propertyLine, anchorPropertyKey) {
  const objectStart = contents.indexOf(`${objectKey}: {`);
  if (objectStart === -1) throw new Error(`Unable to find ${objectKey} object in app.config.ts.`);
  const objectEnd = contents.indexOf('\n  },', objectStart);
  if (objectEnd === -1) throw new Error(`Unable to find end of ${objectKey} object in app.config.ts.`);
  const before = contents.slice(0, objectStart);
  const objectBlock = contents.slice(objectStart, objectEnd);
  const after = contents.slice(objectEnd);
  const existingPattern = new RegExp(`^(\\s*)${propertyKey}:\\s*[^,]+,`, 'm');
  if (existingPattern.test(objectBlock)) {
    return `${before}${objectBlock.replace(existingPattern, propertyLine)}${after}`;
  }
  const anchorPattern = new RegExp(`^(\\s*)${anchorPropertyKey}:\\s*[^,]+,\\n`, 'm');
  const anchorMatch = objectBlock.match(anchorPattern);
  if (!anchorMatch) throw new Error(`Unable to find ${anchorPropertyKey} anchor in ${objectKey} object.`);
  return `${before}${objectBlock.replace(anchorPattern, `${anchorMatch[0]}${propertyLine}\n`)}${after}`;
}

function syncPackageVersions(version) {
  for (const path of VERSIONED_PACKAGES) {
    const pkg = readJson(path);
    pkg.version = version;
    writeJson(path, pkg);
  }
}

function syncExpoConfig(version, buildNumber) {
  const path = 'packages/mobile/app.config.ts';
  let contents = replaceOrThrow(readText(path), /version: '[^']+',/, `version: '${version}',`, path);
  contents = upsertObjectProperty(contents, 'android', 'versionCode', `    versionCode: ${buildNumber},`, 'package');
  contents = upsertObjectProperty(contents, 'ios', 'buildNumber', `    buildNumber: '${buildNumber}',`, 'bundleIdentifier');
  writeText(path, contents);
}

function syncIosNativeVersion(version, buildNumber) {
  const infoPath = 'packages/mobile/ios/TON/Info.plist';
  const projectPath = 'packages/mobile/ios/TON.xcodeproj/project.pbxproj';
  let info = replaceOrThrow(
    readText(infoPath),
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
    `$1${version}$2`,
    infoPath,
  );
  info = replaceOrThrow(
    info,
    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/,
    `$1${buildNumber}$2`,
    infoPath,
  );
  writeText(infoPath, info);
  const project = readText(projectPath)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`)
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  writeText(projectPath, project);
}

function syncGeneratedAndroidGradle(version, buildNumber) {
  const path = 'packages/mobile/android/app/build.gradle';
  let contents;
  try {
    contents = readText(path);
  } catch {
    return;
  }
  writeText(
    path,
    contents
      .replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`)
      .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`),
  );
}

export function syncFiles(version, includeManifest) {
  const buildNumber = versionCodeFor(version);
  syncPackageVersions(version);
  const constantsPath = 'packages/core/src/utils/constants.ts';
  writeText(
    constantsPath,
    replaceOrThrow(
      readText(constantsPath),
      /export const APP_VERSION = '[^']+';/,
      `export const APP_VERSION = '${version}';`,
      constantsPath,
    ),
  );
  syncExpoConfig(version, buildNumber);
  syncIosNativeVersion(version, buildNumber);
  syncGeneratedAndroidGradle(version, buildNumber);
  if (includeManifest) writeJson('update.json', buildUpdateManifest(version));
}
