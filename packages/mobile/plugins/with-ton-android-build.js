const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins');

const HERMES_FLAGS_LINE =
  '    hermesFlags = ["-O", "-output-source-map", "-include-globals=${projectRoot}/hermes/globals.js"]\n';
const COROUTINES_DEPENDENCY_LINE = '    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")\n';
const FFMPEG_KIT_PACKAGE_LINE = "        ffmpegKitPackage = findProperty('ffmpegKitPackage') ?: 'audio'\n";
const FFMPEG_KIT_LOCAL_REPO_LINE = "        maven { url(new File(rootDir, '.gradle/ffmpeg-kit-repo')) }\n";

function insertAfter(contents, anchor, addition, label) {
  if (contents.includes(addition.trim())) {
    return contents;
  }

  const index = contents.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Unable to find ${label} anchor in generated Gradle file.`);
  }

  return contents.slice(0, index + anchor.length) + addition + contents.slice(index + anchor.length);
}

function upsertHermesFlags(contents) {
  const marker = '    hermesFlags = [';
  const markerIndex = contents.indexOf(marker);

  if (markerIndex !== -1) {
    const markerEnd = contents.indexOf('\n', markerIndex);
    if (markerEnd === -1) {
      throw new Error('Unable to find the end of the hermesFlags line in app build.gradle.');
    }
    return `${contents.slice(0, markerIndex)}${HERMES_FLAGS_LINE}${contents.slice(markerEnd + 1)}`;
  }

  return insertAfter(
    contents,
    '    hermesCommand = new File(["node", "--print", "require.resolve(\'react-native/package.json\')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"\n',
    HERMES_FLAGS_LINE,
    'hermesCommand',
  );
}

function upsertDependency(contents, dependencyLine) {
  if (contents.includes(dependencyLine.trim())) {
    return contents;
  }

  const anchor = 'dependencies {\n';
  const index = contents.indexOf(anchor);
  if (index === -1) {
    throw new Error('Unable to find dependencies block in app build.gradle.');
  }

  return contents.slice(0, index + anchor.length)
    + dependencyLine
    + contents.slice(index + anchor.length);
}

function upsertFfmpegKitPackage(contents) {
  const existingPattern = /^\s*ffmpegKitPackage\s*=.*$/m;
  if (existingPattern.test(contents)) {
    return contents.replace(existingPattern, FFMPEG_KIT_PACKAGE_LINE.trimEnd());
  }

  return insertAfter(
    contents,
    "        kotlinVersion = findProperty('android.kotlinVersion') ?: '1.9.25'\n",
    FFMPEG_KIT_PACKAGE_LINE,
    'kotlinVersion',
  );
}

function upsertFfmpegKitBootstrap(contents) {
  const allProjectsAnchor = 'allprojects {\n';
  const allProjectsIndex = contents.indexOf(allProjectsAnchor);
  if (allProjectsIndex === -1) {
    throw new Error('Unable to find allprojects block in root build.gradle.');
  }

  const existingStarts = [
    "def ffmpegKitRepoDir = new File(rootDir, '.gradle/ffmpeg-kit-repo')\n",
    "def ffmpegKitRepoDir = new File(rootDir, 'app/repo')\n",
  ];
  const existingStartIndex = existingStarts
    .map((candidate) => contents.indexOf(candidate))
    .find((index) => index !== -1) ?? -1;
  const bootstrap = `${getFfmpegKitAndroidBootstrapSource().trimEnd()}\n\n`;

  if (existingStartIndex !== -1) {
    return `${contents.slice(0, existingStartIndex)}${bootstrap}${contents.slice(allProjectsIndex)}`;
  }

  return `${contents.slice(0, allProjectsIndex)}${bootstrap}${contents.slice(allProjectsIndex)}`;
}

function upsertFfmpegKitLocalRepo(contents) {
  const withoutExistingRepo = contents
    .split('\n')
    .filter((line) => line.trim() !== FFMPEG_KIT_LOCAL_REPO_LINE.trim())
    .join('\n');

  const anchor = 'allprojects {\n    repositories {\n';
  const index = withoutExistingRepo.indexOf(anchor);
  if (index === -1) {
    throw new Error('Unable to find allprojects repositories block in root build.gradle.');
  }

  return withoutExistingRepo.slice(0, index + anchor.length)
    + FFMPEG_KIT_LOCAL_REPO_LINE
    + withoutExistingRepo.slice(index + anchor.length);
}

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
  const attrs = {
    'android:name': name,
    'android:value': value,
  };

  if (replaceAttribute) {
    attrs['tools:replace'] = replaceAttribute;
  }

  if (existing) {
    existing.$ = {
      ...existing.$,
      ...attrs,
    };
  } else {
    metaData.push({ $: attrs });
    application['meta-data'] = metaData;
  }
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function loadDownloadsModuleTemplate(fileName, packageName) {
  const templatePath = path.join(
    __dirname,
    'android-templates',
    'downloads',
    fileName,
  );
  const template = fs.readFileSync(templatePath, 'utf8');
  return template.replace(/^package\s+.+$/m, `package ${packageName}.downloads`);
}

function patchAdaptiveIconResources(platformRoot) {
  const resRoot = path.join(platformRoot, 'app', 'src', 'main', 'res');
  const colorsPath = path.join(resRoot, 'values', 'colors.xml');
  const adaptiveIconPaths = [
    path.join(resRoot, 'mipmap-anydpi-v33', 'ic_launcher.xml'),
    path.join(resRoot, 'mipmap-anydpi-v33', 'ic_launcher_round.xml'),
  ];

  if (fs.existsSync(colorsPath)) {
    const colorsContents = fs.readFileSync(colorsPath, 'utf8');
    const nextColorsContents = colorsContents.replace(
      '<color name="ic_launcher_bg">#00000000</color>',
      '<color name="ic_launcher_bg">#000000</color>',
    );
    writeFileIfChanged(colorsPath, nextColorsContents);
  }

  for (const iconPath of adaptiveIconPaths) {
    if (!fs.existsSync(iconPath)) {
      continue;
    }

    const iconContents = fs.readFileSync(iconPath, 'utf8');
    const nextIconContents = iconContents
      .replace('@color/ic_launcher_bg', '@color/iconBackground')
      .replace(/\s*<monochrome android:drawable="@drawable\/ic_launcher_monochrome" \/>\n?/g, '\n');
    writeFileIfChanged(iconPath, nextIconContents);
  }
}

function removeDuplicateLegacyLauncherIcons(platformRoot) {
  const resRoot = path.join(platformRoot, 'app', 'src', 'main', 'res');
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  const duplicateNames = ['ic_launcher.webp', 'ic_launcher_round.webp'];

  for (const density of densities) {
    for (const fileName of duplicateNames) {
      const duplicatePath = path.join(resRoot, `mipmap-${density}`, fileName);
      if (fs.existsSync(duplicatePath)) {
        fs.rmSync(duplicatePath);
      }
    }
  }
}

function patchDebugManifest(platformRoot) {
  const debugManifestPath = path.join(platformRoot, 'app', 'src', 'debug', 'AndroidManifest.xml');
  if (!fs.existsSync(debugManifestPath)) {
    return;
  }

  const contents = fs.readFileSync(debugManifestPath, 'utf8');
  const nextContents = contents.replace(/\s+tools:replace="android:usesCleartextTraffic"/g, '');
  writeFileIfChanged(debugManifestPath, nextContents);
}

function upsertImport(contents, importLine) {
  if (contents.includes(importLine)) {
    return contents;
  }

  const lastImportIndex = contents.lastIndexOf('import ');
  if (lastImportIndex === -1) {
    throw new Error('Unable to find imports in generated MainApplication.kt.');
  }

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

    if (!anchor) {
      throw new Error('Unable to find package insertion anchor in MainApplication.kt.');
    }

    nextContents = nextContents.replace(anchor, `${packageAddLine}\n${anchor}`);
  }

  return nextContents;
}

function upsertMainApplicationPackages(contents, packageName) {
  let nextContents = contents;

  nextContents = upsertReactPackage(
    nextContents,
    `import ${packageName}.audioboost.AudioBoostPackage`,
    '            packages.add(AudioBoostPackage())',
  );

  nextContents = upsertReactPackage(
    nextContents,
    `import ${packageName}.audioequalizer.AudioEqualizerPackage`,
    '            packages.add(AudioEqualizerPackage())',
  );

  nextContents = upsertReactPackage(
    nextContents,
    `import ${packageName}.downloads.AndroidDownloadsPackage`,
    '            packages.add(AndroidDownloadsPackage())',
  );

  return nextContents;
}

function upsertManifestComponent(androidManifest, key, name, attrs) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const collection = application[key] ?? [];
  const existing = collection.find((item) => item.$?.['android:name'] === name);

  if (existing) {
    existing.$ = {
      ...existing.$,
      ...attrs,
    };
  } else {
    collection.push({ $: attrs });
    application[key] = collection;
  }
}

const {
  getAudioBoostModuleSource,
  getAudioBoostPackageSource,
  getAudioEqualizerModuleSource,
  getAudioEqualizerPackageSource,
  getFfmpegKitAndroidBootstrapSource,
  getDownloadNotificationsSource,
  getAndroidDownloadsModuleSource,
  getAndroidDownloadsPackageSource,
  getDownloadForegroundServiceSource,
  getDownloadNotificationActionReceiverSource,
  getDownloadTaskServiceSource,
} = require('./with-ton-android-build-sources');

module.exports = function withTonAndroidBuild(config) {
  config = withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = upsertHermesFlags(gradleConfig.modResults.contents);
    gradleConfig.modResults.contents = upsertDependency(
      gradleConfig.modResults.contents,
      COROUTINES_DEPENDENCY_LINE,
    );
    return gradleConfig;
  });

  config = withAndroidManifest(config, (androidConfig) => {
    const packageName = androidConfig.android?.package ?? config.android?.package;
    if (!packageName) {
      throw new Error('Android package name is required to wire native Android modules.');
    }

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    application.$['android:supportsRtl'] = 'false';

    upsertMetaData(
      androidConfig.modResults,
      'com.facebook.soloader.enabled',
      'true',
      'android:value',
    );
    upsertManifestComponent(androidConfig.modResults, 'service', `${packageName}.downloads.DownloadForegroundService`, {
      'android:name': `${packageName}.downloads.DownloadForegroundService`,
      'android:enabled': 'true',
      'android:exported': 'false',
      'android:foregroundServiceType': 'dataSync',
    });
    upsertManifestComponent(androidConfig.modResults, 'service', `${packageName}.downloads.DownloadTaskService`, {
      'android:name': `${packageName}.downloads.DownloadTaskService`,
      'android:enabled': 'true',
      'android:exported': 'false',
    });
    upsertManifestComponent(androidConfig.modResults, 'receiver', `${packageName}.downloads.DownloadNotificationActionReceiver`, {
      'android:name': `${packageName}.downloads.DownloadNotificationActionReceiver`,
      'android:enabled': 'true',
      'android:exported': 'false',
    });
    return androidConfig;
  });

  config = withGradleProperties(config, (gradleConfig) => {
    upsertGradleProperty(gradleConfig.modResults, 'org.gradle.caching', 'true');
    upsertGradleProperty(gradleConfig.modResults, 'org.gradle.parallel', 'true');
    return gradleConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const packageName = androidConfig.android?.package ?? config.android?.package;
      if (!packageName) {
        throw new Error('Android package name is required to wire the AudioEqualizer module.');
      }

      const platformRoot = androidConfig.modRequest.platformProjectRoot;
      const packagePath = packageName.split('.');
      const javaRoot = path.join(platformRoot, 'app', 'src', 'main', 'java');
      const rootBuildGradlePath = path.join(platformRoot, 'build.gradle');
      const mainApplicationPath = path.join(javaRoot, ...packagePath, 'MainApplication.kt');
      const audioBoostDir = path.join(javaRoot, ...packagePath, 'audioboost');
      const audioEqualizerDir = path.join(javaRoot, ...packagePath, 'audioequalizer');
      const downloadsDir = path.join(javaRoot, ...packagePath, 'downloads');
      const drawableDir = path.join(platformRoot, 'app', 'src', 'main', 'res', 'drawable');

      const rootBuildGradleContents = fs.readFileSync(rootBuildGradlePath, 'utf8');
      fs.writeFileSync(
        rootBuildGradlePath,
        upsertFfmpegKitLocalRepo(
          upsertFfmpegKitBootstrap(
            upsertFfmpegKitPackage(rootBuildGradleContents),
          ),
        ),
      );

      const mainApplicationContents = fs.readFileSync(mainApplicationPath, 'utf8');
      fs.writeFileSync(
        mainApplicationPath,
        upsertMainApplicationPackages(mainApplicationContents, packageName),
      );

      writeFileIfChanged(
        path.join(audioBoostDir, 'AudioBoostModule.kt'),
        getAudioBoostModuleSource(packageName),
      );
      writeFileIfChanged(
        path.join(audioBoostDir, 'AudioBoostPackage.kt'),
        getAudioBoostPackageSource(packageName),
      );
      writeFileIfChanged(
        path.join(audioEqualizerDir, 'AudioEqualizerModule.kt'),
        getAudioEqualizerModuleSource(packageName),
      );
      writeFileIfChanged(
        path.join(audioEqualizerDir, 'AudioEqualizerPackage.kt'),
        getAudioEqualizerPackageSource(packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'DownloadNotifications.kt'),
        getDownloadNotificationsSource(packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'AndroidDownloadsModule.kt'),
        getAndroidDownloadsModuleSource(packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'AndroidLibraryTransferModule.kt'),
        loadDownloadsModuleTemplate('AndroidLibraryTransferModule.kt', packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'AndroidDownloadsPackage.kt'),
        getAndroidDownloadsPackageSource(packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'DownloadForegroundService.kt'),
        getDownloadForegroundServiceSource(packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'DownloadNotificationActionReceiver.kt'),
        getDownloadNotificationActionReceiverSource(packageName),
      );
      writeFileIfChanged(
        path.join(downloadsDir, 'DownloadTaskService.kt'),
        getDownloadTaskServiceSource(packageName),
      );
      patchAdaptiveIconResources(platformRoot);
      removeDuplicateLegacyLauncherIcons(platformRoot);
      patchDebugManifest(platformRoot);

      return androidConfig;
    },
  ]);

  return config;
};
