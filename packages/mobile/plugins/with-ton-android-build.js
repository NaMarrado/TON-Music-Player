const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins');
const {
  COROUTINES_DEPENDENCY_LINE,
  upsertDependency,
  upsertFfmpegKitBootstrap,
  upsertFfmpegKitLocalRepo,
  upsertFfmpegKitPackage,
  upsertHermesFlags,
} = require('./with-ton-android-gradle');
const {
  loadAndroidTemplate,
  patchAdaptiveIconResources,
  patchDebugManifest,
  upsertGradleProperty,
  upsertMainApplicationPackages,
  upsertManifestComponent,
  upsertMetaData,
  writeFileIfChanged,
} = require('./with-ton-android-project');

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
    upsertMetaData(androidConfig.modResults, 'com.facebook.soloader.enabled', 'true', 'android:value');
    upsertManifestComponent(
      androidConfig.modResults,
      'service',
      `${packageName}.downloads.DownloadForegroundService`,
      {
        'android:name': `${packageName}.downloads.DownloadForegroundService`,
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'dataSync',
      },
    );
    upsertManifestComponent(
      androidConfig.modResults,
      'service',
      `${packageName}.downloads.DownloadTaskService`,
      {
        'android:name': `${packageName}.downloads.DownloadTaskService`,
        'android:enabled': 'true',
        'android:exported': 'false',
      },
    );
    upsertManifestComponent(
      androidConfig.modResults,
      'receiver',
      `${packageName}.downloads.DownloadNotificationActionReceiver`,
      {
        'android:name': `${packageName}.downloads.DownloadNotificationActionReceiver`,
        'android:enabled': 'true',
        'android:exported': 'false',
      },
    );
    return androidConfig;
  });

  config = withGradleProperties(config, (gradleConfig) => {
    // RN Track Player 4.1 exposes coroutine Jobs from @ReactMethod methods,
    // which Android's TurboModule parser rejects at runtime.
    upsertGradleProperty(gradleConfig.modResults, 'newArchEnabled', 'false');
    upsertGradleProperty(gradleConfig.modResults, 'org.gradle.caching', 'true');
    upsertGradleProperty(gradleConfig.modResults, 'org.gradle.parallel', 'true');
    return gradleConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const packageName = androidConfig.android?.package ?? config.android?.package;
      if (!packageName) {
        throw new Error('Android package name is required to wire native Android modules.');
      }
      const platformRoot = androidConfig.modRequest.platformProjectRoot;
      const packagePath = packageName.split('.');
      const javaRoot = path.join(platformRoot, 'app', 'src', 'main', 'java');
      const rootBuildGradlePath = path.join(platformRoot, 'build.gradle');
      const mainApplicationPath = path.join(javaRoot, ...packagePath, 'MainApplication.kt');
      const sourceGroups = [
        ['audioboost', ['AudioBoostModule.kt', 'AudioBoostPackage.kt']],
        ['audioequalizer', ['AudioEqualizerModule.kt', 'AudioEqualizerPackage.kt']],
        ['downloads', [
          'AndroidDownloadsModule.kt',
          'AndroidDownloadsPackage.kt',
          'AndroidLibraryTransferArchive.kt',
          'AndroidLibraryTransferFiles.kt',
          'AndroidLibraryTransferModels.kt',
          'AndroidLibraryTransferModule.kt',
          'AndroidLibraryTransferRequestParser.kt',
          'AndroidLibraryTransferRunner.kt',
          'DownloadForegroundService.kt',
          'DownloadNotificationActionReceiver.kt',
          'DownloadNotificationBuilders.kt',
          'DownloadNotifications.kt',
          'DownloadTaskService.kt',
        ]],
      ];

      const rootBuildGradle = fs.readFileSync(rootBuildGradlePath, 'utf8');
      fs.writeFileSync(
        rootBuildGradlePath,
        upsertFfmpegKitLocalRepo(upsertFfmpegKitBootstrap(upsertFfmpegKitPackage(rootBuildGradle))),
      );
      const mainApplication = fs.readFileSync(mainApplicationPath, 'utf8');
      fs.writeFileSync(
        mainApplicationPath,
        upsertMainApplicationPackages(mainApplication, packageName),
      );

      for (const [groupName, fileNames] of sourceGroups) {
        const outputDir = path.join(javaRoot, ...packagePath, groupName);
        for (const fileName of fileNames) {
          writeFileIfChanged(
            path.join(outputDir, fileName),
            loadAndroidTemplate(groupName, fileName, packageName),
          );
        }
      }
      patchAdaptiveIconResources(platformRoot);
      patchDebugManifest(platformRoot);
      return androidConfig;
    },
  ]);

  return config;
};
