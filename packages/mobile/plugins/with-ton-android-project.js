const fs = require('fs');
const path = require('path');
const { AndroidConfig } = require('expo/config-plugins');

function upsertGradleProperty(modResults, key, value) {
  const existing = modResults.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return modResults;
  }
  modResults.push({ type: 'property', key, value });
  return modResults;
}

function upsertMetaData(androidManifest, name, value, replaceAttribute) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const metaData = application['meta-data'] ?? [];
  const existing = metaData.find((item) => item.$?.['android:name'] === name);
  const attrs = { 'android:name': name, 'android:value': value };
  if (replaceAttribute) attrs['tools:replace'] = replaceAttribute;
  if (existing) existing.$ = { ...existing.$, ...attrs };
  else {
    metaData.push({ $: attrs });
    application['meta-data'] = metaData;
  }
}

function upsertMetaDataResource(androidManifest, name, resource) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const metaData = application['meta-data'] ?? [];
  const existing = metaData.find((item) => item.$?.['android:name'] === name);
  const attrs = { 'android:name': name, 'android:resource': resource };
  if (existing) {
    const { ['android:value']: _value, ...remaining } = existing.$ ?? {};
    existing.$ = { ...remaining, ...attrs };
  } else {
    metaData.push({ $: attrs });
    application['meta-data'] = metaData;
  }
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function loadAndroidTemplate(groupName, fileName, packageName) {
  const templatePath = path.join(__dirname, 'android-templates', groupName, fileName);
  return fs.readFileSync(templatePath, 'utf8')
    .replaceAll('__PACKAGE_NAME__', packageName)
    .replace(/^package\s+.+$/m, `package ${packageName}.${groupName}`);
}

function patchAdaptiveIconResources(platformRoot) {
  const resRoot = path.join(platformRoot, 'app', 'src', 'main', 'res');
  const colorsPath = path.join(resRoot, 'values', 'colors.xml');
  const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/iconBackground" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  if (fs.existsSync(colorsPath)) {
    const contents = fs.readFileSync(colorsPath, 'utf8')
      .replace(/(<color name="ic_launcher_bg">)[^<]*(<\/color>)/, '$1#000000$2')
      .replace(/(<color name="iconBackground">)[^<]*(<\/color>)/, '$1#000000$2');
    writeFileIfChanged(colorsPath, contents);
  }
  for (const apiLevel of ['v26', 'v33']) {
    for (const iconName of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      writeFileIfChanged(path.join(resRoot, `mipmap-anydpi-${apiLevel}`, iconName), adaptiveIconXml);
    }
  }
}

function patchDebugManifest(platformRoot) {
  const manifestPath = path.join(platformRoot, 'app', 'src', 'debug', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) return;
  const contents = fs.readFileSync(manifestPath, 'utf8')
    .replace(/\s+tools:replace="android:usesCleartextTraffic"/g, '');
  writeFileIfChanged(manifestPath, contents);
}

function upsertImport(contents, importLine) {
  if (contents.includes(importLine)) return contents;
  const lastImportIndex = contents.lastIndexOf('import ');
  if (lastImportIndex === -1) throw new Error('Unable to find imports in generated MainApplication.kt.');
  const importLineEnd = contents.indexOf('\n', lastImportIndex);
  return `${contents.slice(0, importLineEnd + 1)}${importLine}\n${contents.slice(importLineEnd + 1)}`;
}

function upsertReactPackage(contents, importLine, packageAddLine) {
  let nextContents = upsertImport(contents, importLine);
  if (!nextContents.includes(packageAddLine)) {
    const anchors = [
      '            // packages.add(new MyReactNativePackage());\n',
      '            return packages\n',
      '            packages.add(AudioBoostPackage())\n',
    ];
    const anchor = anchors.find((candidate) => nextContents.includes(candidate));
    if (!anchor) throw new Error('Unable to find package insertion anchor in MainApplication.kt.');
    nextContents = nextContents.replace(anchor, `${packageAddLine}\n${anchor}`);
  }
  return nextContents;
}

function upsertMainApplicationPackages(contents, packageName) {
  let nextContents = contents;
  for (const [folder, className] of [
    ['audioboost', 'AudioBoostPackage'],
    ['audioequalizer', 'AudioEqualizerPackage'],
    ['downloads', 'AndroidDownloadsPackage'],
  ]) {
    nextContents = upsertReactPackage(
      nextContents,
      `import ${packageName}.${folder}.${className}`,
      `            packages.add(${className}())`,
    );
  }
  return nextContents;
}

function upsertManifestComponent(androidManifest, key, name, attrs) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const collection = application[key] ?? [];
  const existing = collection.find((item) => item.$?.['android:name'] === name);
  if (existing) existing.$ = { ...existing.$, ...attrs };
  else {
    collection.push({ $: attrs });
    application[key] = collection;
  }
}

module.exports = {
  loadAndroidTemplate,
  patchAdaptiveIconResources,
  patchDebugManifest,
  upsertGradleProperty,
  upsertMainApplicationPackages,
  upsertManifestComponent,
  upsertMetaData,
  upsertMetaDataResource,
  writeFileIfChanged,
};
