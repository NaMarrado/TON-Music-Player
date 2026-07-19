const {
  DOWNLOAD_ACTIVITY_FILES,
  DOWNLOAD_ACTIVITY_INFO_PLIST,
  DOWNLOAD_ACTIVITY_TARGET_NAME,
} = require('./with-ton-ios-build-config');
const {
  ensureBuildPhase,
  ensureDownloadActivityGroup,
  ensureProjectSection,
  ensureSourceInTarget,
  ensureTargetDependency,
  findNativeTarget,
  targetBuildSettingsByName,
  unquotePbxValue,
} = require('./with-ton-ios-project-helpers');

function configureExtensionBuildSettings(project, appTarget, extensionTarget, fallbackBundleId) {
  const appSettings = targetBuildSettingsByName(project, appTarget);
  const extensionSettings = targetBuildSettingsByName(project, extensionTarget);
  for (const [name, settings] of Object.entries(extensionSettings)) {
    const source = appSettings[name] ?? Object.values(appSettings)[0] ?? {};
    const baseBundleId = unquotePbxValue(source.PRODUCT_BUNDLE_IDENTIFIER) || fallbackBundleId;
    Object.assign(settings, {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      CODE_SIGN_STYLE: source.CODE_SIGN_STYLE ?? 'Automatic',
      CURRENT_PROJECT_VERSION: source.CURRENT_PROJECT_VERSION ?? '1',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: DOWNLOAD_ACTIVITY_INFO_PLIST,
      IPHONEOS_DEPLOYMENT_TARGET: '16.1',
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      MARKETING_VERSION: source.MARKETING_VERSION ?? '1.0.0',
      PRODUCT_BUNDLE_IDENTIFIER: `${baseBundleId}.downloads`,
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SKIP_INSTALL: 'YES',
      SWIFT_EMIT_LOC_STRINGS: 'YES',
      SWIFT_VERSION: source.SWIFT_VERSION ?? '5.0',
      TARGETED_DEVICE_FAMILY: source.TARGETED_DEVICE_FAMILY ?? '1',
    });
    if (source.DEVELOPMENT_TEAM) settings.DEVELOPMENT_TEAM = source.DEVELOPMENT_TEAM;
    else delete settings.DEVELOPMENT_TEAM;
    delete settings.GCC_PREPROCESSOR_DEFINITIONS;
  }
}

function configureEmbedExtensionPhase(project, appTargetUuid, extensionTarget) {
  const buildFiles = project.pbxBuildFileSection();
  const copyPhases = ensureProjectSection(project, 'PBXCopyFilesBuildPhase');
  const appTarget = project.pbxNativeTargetSection()[appTargetUuid];
  for (const phaseRef of appTarget.buildPhases) {
    const phase = copyPhases[phaseRef.value];
    if (!phase) continue;
    const productRef = phase.files.find((file) => (
      buildFiles[file.value]?.fileRef === extensionTarget.productReference
    ));
    if (!productRef) continue;
    phase.name = '"Embed Foundation Extensions"';
    copyPhases[`${phaseRef.value}_comment`] = 'Embed Foundation Extensions';
    phaseRef.comment = 'Embed Foundation Extensions';
    buildFiles[productRef.value].settings = {
      ATTRIBUTES: ['RemoveHeadersOnCopy', 'CodeSignOnCopy'],
    };
    const comment = `${DOWNLOAD_ACTIVITY_TARGET_NAME}.appex in Embed Foundation Extensions`;
    buildFiles[`${productRef.value}_comment`] = comment;
    productRef.comment = comment;
    return;
  }
}

function addActivitySources(project, appTargetUuid, extensionTargetUuid, refs) {
  for (const key of ['attributes', 'manager', 'runtime']) {
    const name = DOWNLOAD_ACTIVITY_FILES[key];
    ensureSourceInTarget(project, appTargetUuid, refs[name], name);
  }
  for (const key of ['attributes', 'widget', 'bundle']) {
    const name = DOWNLOAD_ACTIVITY_FILES[key];
    ensureSourceInTarget(project, extensionTargetUuid, refs[name], name);
  }
}

function ensureIosDownloadActivityTarget(project, fallbackBundleId = 'cz.ton.player') {
  const appTargetEntry = project.getFirstTarget();
  const appTarget = appTargetEntry.firstTarget;
  const appTargetUuid = appTargetEntry.uuid;
  ensureProjectSection(project, 'PBXContainerItemProxy');
  ensureProjectSection(project, 'PBXTargetDependency');

  let extension = findNativeTarget(project, DOWNLOAD_ACTIVITY_TARGET_NAME);
  if (!extension) {
    const appSettings = targetBuildSettingsByName(project, appTarget);
    const firstSettings = Object.values(appSettings)[0] ?? {};
    const baseBundleId = unquotePbxValue(firstSettings.PRODUCT_BUNDLE_IDENTIFIER) || fallbackBundleId;
    const added = project.addTarget(
      DOWNLOAD_ACTIVITY_TARGET_NAME,
      'app_extension',
      DOWNLOAD_ACTIVITY_TARGET_NAME,
      `${baseBundleId}.downloads`,
    );
    extension = { target: added.pbxNativeTarget, uuid: added.uuid };
  }

  addActivitySources(project, appTargetUuid, extension.uuid, ensureDownloadActivityGroup(project));
  ensureBuildPhase(project, extension.uuid, 'PBXFrameworksBuildPhase', 'Frameworks');
  ensureTargetDependency(project, appTargetUuid, extension.uuid);
  configureExtensionBuildSettings(project, appTarget, extension.target, fallbackBundleId);
  configureEmbedExtensionPhase(project, appTargetUuid, extension.target);

  const projectObject = project.pbxProjectSection()[project.getFirstProject().uuid];
  projectObject.attributes = projectObject.attributes ?? {};
  projectObject.attributes.TargetAttributes = projectObject.attributes.TargetAttributes ?? {};
  projectObject.attributes.TargetAttributes[extension.uuid] = { CreatedOnToolsVersion: '16.0' };
  return project;
}

module.exports = { ensureIosDownloadActivityTarget };
