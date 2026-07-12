const IOS_BACKGROUND_MODES = ['audio'];
const APP_TARGET_INHERITED_LD_FLAGS = ['-ObjC', '-lc++'];
const PODS_TON_DUPLICATE_LD_FLAGS = ['-l"c++"'];
const DOWNLOAD_ACTIVITY_TARGET_NAME = 'TONDownloadActivity';
const DOWNLOAD_ACTIVITY_SOURCE_ROOT = '../native/ios/download-activity';
const DOWNLOAD_ACTIVITY_INFO_PLIST = `${DOWNLOAD_ACTIVITY_SOURCE_ROOT}/Info.plist`;
const DOWNLOAD_ACTIVITY_FILES = {
  attributes: 'TONDownloadActivityAttributes.swift',
  bundle: 'TONDownloadActivityBundle.swift',
  manager: 'TONIosDownloadActivityManager.swift',
  plist: 'Info.plist',
  widget: 'TONDownloadLiveActivity.swift',
};
const FMT_CONSTEVAL_PATCH = `    fmt_base = File.join(installer.sandbox.pod_dir('fmt'), 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      patched = content.gsub(/^#\\s*define FMT_USE_CONSTEVAL 1$/, '# define FMT_USE_CONSTEVAL 0')
      if patched != content
        File.chmod(0o644, fmt_base)
        File.write(fmt_base, patched)
      end
    end
`;
const PODS_TON_LD_FLAGS_PATCH = `    pods_ton_duplicate_ld_flags = ${toRubyStringList(PODS_TON_DUPLICATE_LD_FLAGS)}
    Dir.glob(File.join(installer.sandbox.root.to_s, 'Target Support Files', 'Pods-TON', 'Pods-TON.*.xcconfig')).each do |xcconfig_path|
      content = File.read(xcconfig_path)
      patched = content.lines.map do |line|
        if line.start_with?('OTHER_LDFLAGS = ')
          line.split(' ').reject { |token| pods_ton_duplicate_ld_flags.include?(token) }.join(' ') + "\\n"
        else
          line
        end
      end.join
      if patched != content
        File.write(xcconfig_path, patched)
      end
    end
`;

function toRubyStringList(values) {
  return `[${values.map((value) => `'${value.replace(/'/g, "\\'")}'`).join(', ')}]`;
}

function mergeStringArray(existingValues, requiredValues) {
  const values = Array.isArray(existingValues) ? existingValues.filter(Boolean) : [];
  const merged = [...values];

  for (const value of requiredValues) {
    if (!merged.includes(value)) {
      merged.push(value);
    }
  }

  return merged;
}

function insertFmtPodfilePatch(contents) {
  if (contents.includes("installer.sandbox.pod_dir('fmt')")) {
    return contents;
  }

  const anchor = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )
`;

  if (!contents.includes(anchor)) {
    throw new Error('Unable to find react_native_post_install block in generated Podfile.');
  }

  return contents.replace(anchor, `${anchor}\n${FMT_CONSTEVAL_PATCH}`);
}

function insertPodsTonLdFlagsPodfilePatch(contents) {
  if (contents.includes('pods_ton_duplicate_ld_flags')) {
    return contents;
  }

  const anchor = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )
`;

  if (!contents.includes(anchor)) {
    throw new Error('Unable to find react_native_post_install block in generated Podfile.');
  }

  return contents.replace(anchor, `${anchor}\n${PODS_TON_LD_FLAGS_PATCH}`);
}

function unquotePbxValue(value) {
  return typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : value;
}

function isCommentKey(key) {
  return key.endsWith('_comment');
}

function findNativeTarget(project, name) {
  const targets = project.pbxNativeTargetSection();
  for (const [key, target] of Object.entries(targets)) {
    if (isCommentKey(key) || !target) {
      continue;
    }

    if (unquotePbxValue(target.name) === name) {
      return { target, uuid: key };
    }
  }

  return null;
}

function ensureProjectSection(project, sectionName) {
  const objects = project.hash.project.objects;
  if (!objects[sectionName]) {
    objects[sectionName] = {};
  }
  return objects[sectionName];
}

function ensureDownloadActivityGroup(project) {
  const groups = ensureProjectSection(project, 'PBXGroup');
  let groupUuid = null;

  for (const [key, group] of Object.entries(groups)) {
    if (isCommentKey(key) || !group) {
      continue;
    }
    if (unquotePbxValue(group.path) === DOWNLOAD_ACTIVITY_SOURCE_ROOT) {
      groupUuid = key;
      break;
    }
  }

  if (!groupUuid) {
    groupUuid = project.generateUuid();
    groups[groupUuid] = {
      isa: 'PBXGroup',
      children: [],
      name: DOWNLOAD_ACTIVITY_TARGET_NAME,
      path: DOWNLOAD_ACTIVITY_SOURCE_ROOT,
      sourceTree: '"<group>"',
    };
    groups[`${groupUuid}_comment`] = DOWNLOAD_ACTIVITY_TARGET_NAME;

    const projectObject = project.pbxProjectSection()[project.getFirstProject().uuid];
    const mainGroup = groups[projectObject.mainGroup];
    mainGroup.children.push({ value: groupUuid, comment: DOWNLOAD_ACTIVITY_TARGET_NAME });
  }

  const group = groups[groupUuid];
  const fileReferences = ensureProjectSection(project, 'PBXFileReference');
  const fileRefByName = {};

  for (const fileName of Object.values(DOWNLOAD_ACTIVITY_FILES)) {
    const existingChild = group.children.find((child) => child.comment === fileName);
    if (existingChild) {
      fileRefByName[fileName] = existingChild.value;
      continue;
    }

    const fileRefUuid = project.generateUuid();
    const isPlist = fileName.endsWith('.plist');
    fileReferences[fileRefUuid] = {
      isa: 'PBXFileReference',
      lastKnownFileType: isPlist ? 'text.plist.xml' : 'sourcecode.swift',
      path: fileName,
      sourceTree: '"<group>"',
    };
    fileReferences[`${fileRefUuid}_comment`] = fileName;
    group.children.push({ value: fileRefUuid, comment: fileName });
    fileRefByName[fileName] = fileRefUuid;
  }

  return fileRefByName;
}

function findBuildPhase(project, targetUuid, phaseType) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const phases = ensureProjectSection(project, phaseType);

  for (const phaseRef of target.buildPhases) {
    if (phases[phaseRef.value]) {
      return phases[phaseRef.value];
    }
  }

  return null;
}

function ensureBuildPhase(project, targetUuid, phaseType, name) {
  const existing = findBuildPhase(project, targetUuid, phaseType);
  if (existing) {
    return existing;
  }

  return project.addBuildPhase([], phaseType, name, targetUuid).buildPhase;
}

function ensureSourceInTarget(project, targetUuid, fileRefUuid, fileName) {
  const sources = ensureBuildPhase(project, targetUuid, 'PBXSourcesBuildPhase', 'Sources');
  const buildFiles = ensureProjectSection(project, 'PBXBuildFile');
  const alreadyIncluded = sources.files.some((file) => (
    buildFiles[file.value]?.fileRef === fileRefUuid
  ));
  if (alreadyIncluded) {
    return;
  }

  const buildFileUuid = project.generateUuid();
  buildFiles[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    fileRef_comment: fileName,
  };
  buildFiles[`${buildFileUuid}_comment`] = `${fileName} in Sources`;
  sources.files.push({ value: buildFileUuid, comment: `${fileName} in Sources` });
}

function targetBuildSettingsByName(project, target) {
  const lists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const list = lists[target.buildConfigurationList];
  const result = {};

  for (const configurationRef of list.buildConfigurations) {
    result[configurationRef.comment] = configurations[configurationRef.value].buildSettings;
  }

  return result;
}

function ensureTargetDependency(project, appTargetUuid, extensionTargetUuid) {
  ensureProjectSection(project, 'PBXContainerItemProxy');
  const dependencies = ensureProjectSection(project, 'PBXTargetDependency');
  const appTarget = project.pbxNativeTargetSection()[appTargetUuid];
  const alreadyPresent = appTarget.dependencies.some((dependencyRef) => (
    dependencies[dependencyRef.value]?.target === extensionTargetUuid
  ));

  if (!alreadyPresent) {
    project.addTargetDependency(appTargetUuid, [extensionTargetUuid]);
  }
}

function configureExtensionBuildSettings(project, appTarget, extensionTarget, fallbackBundleId) {
  const appSettings = targetBuildSettingsByName(project, appTarget);
  const extensionSettings = targetBuildSettingsByName(project, extensionTarget);

  for (const [configurationName, buildSettings] of Object.entries(extensionSettings)) {
    const sourceSettings = appSettings[configurationName] ?? Object.values(appSettings)[0] ?? {};
    const baseBundleId = unquotePbxValue(sourceSettings.PRODUCT_BUNDLE_IDENTIFIER)
      || fallbackBundleId;

    buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
    buildSettings.CODE_SIGN_STYLE = sourceSettings.CODE_SIGN_STYLE ?? 'Automatic';
    buildSettings.CURRENT_PROJECT_VERSION = sourceSettings.CURRENT_PROJECT_VERSION ?? '1';
    buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
    buildSettings.INFOPLIST_FILE = DOWNLOAD_ACTIVITY_INFO_PLIST;
    buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.1';
    buildSettings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
    buildSettings.MARKETING_VERSION = sourceSettings.MARKETING_VERSION ?? '1.0.0';
    buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `${baseBundleId}.downloads`;
    buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
    buildSettings.SKIP_INSTALL = 'YES';
    buildSettings.SWIFT_EMIT_LOC_STRINGS = 'YES';
    buildSettings.SWIFT_VERSION = sourceSettings.SWIFT_VERSION ?? '5.0';
    buildSettings.TARGETED_DEVICE_FAMILY = sourceSettings.TARGETED_DEVICE_FAMILY ?? '1';

    if (sourceSettings.DEVELOPMENT_TEAM) {
      buildSettings.DEVELOPMENT_TEAM = sourceSettings.DEVELOPMENT_TEAM;
    } else {
      delete buildSettings.DEVELOPMENT_TEAM;
    }

    delete buildSettings.GCC_PREPROCESSOR_DEFINITIONS;
  }
}

function configureEmbedExtensionPhase(project, appTargetUuid, extensionTarget) {
  const buildFiles = project.pbxBuildFileSection();
  const copyPhases = ensureProjectSection(project, 'PBXCopyFilesBuildPhase');
  const appTarget = project.pbxNativeTargetSection()[appTargetUuid];

  for (const phaseRef of appTarget.buildPhases) {
    const phase = copyPhases[phaseRef.value];
    if (!phase) {
      continue;
    }

    const productBuildFileRef = phase.files.find((file) => (
      buildFiles[file.value]?.fileRef === extensionTarget.productReference
    ));
    if (!productBuildFileRef) {
      continue;
    }

    phase.name = '"Embed Foundation Extensions"';
    copyPhases[`${phaseRef.value}_comment`] = 'Embed Foundation Extensions';
    phaseRef.comment = 'Embed Foundation Extensions';
    buildFiles[productBuildFileRef.value].settings = {
      ATTRIBUTES: ['RemoveHeadersOnCopy', 'CodeSignOnCopy'],
    };
    buildFiles[`${productBuildFileRef.value}_comment`] =
      `${DOWNLOAD_ACTIVITY_TARGET_NAME}.appex in Embed Foundation Extensions`;
    productBuildFileRef.comment =
      `${DOWNLOAD_ACTIVITY_TARGET_NAME}.appex in Embed Foundation Extensions`;
    return;
  }
}

function ensureIosDownloadActivityTarget(project, fallbackBundleId = 'com.ton.player') {
  const appTargetEntry = project.getFirstTarget();
  const appTarget = appTargetEntry.firstTarget;
  const appTargetUuid = appTargetEntry.uuid;

  ensureProjectSection(project, 'PBXContainerItemProxy');
  ensureProjectSection(project, 'PBXTargetDependency');

  let extensionTargetEntry = findNativeTarget(project, DOWNLOAD_ACTIVITY_TARGET_NAME);
  if (!extensionTargetEntry) {
    const appSettings = targetBuildSettingsByName(project, appTarget);
    const firstSettings = Object.values(appSettings)[0] ?? {};
    const baseBundleId = unquotePbxValue(firstSettings.PRODUCT_BUNDLE_IDENTIFIER)
      || fallbackBundleId;
    const addedTarget = project.addTarget(
      DOWNLOAD_ACTIVITY_TARGET_NAME,
      'app_extension',
      DOWNLOAD_ACTIVITY_TARGET_NAME,
      `${baseBundleId}.downloads`,
    );
    extensionTargetEntry = {
      target: addedTarget.pbxNativeTarget,
      uuid: addedTarget.uuid,
    };
  }

  const fileRefs = ensureDownloadActivityGroup(project);
  ensureSourceInTarget(
    project,
    appTargetUuid,
    fileRefs[DOWNLOAD_ACTIVITY_FILES.attributes],
    DOWNLOAD_ACTIVITY_FILES.attributes,
  );
  ensureSourceInTarget(
    project,
    appTargetUuid,
    fileRefs[DOWNLOAD_ACTIVITY_FILES.manager],
    DOWNLOAD_ACTIVITY_FILES.manager,
  );
  ensureSourceInTarget(
    project,
    extensionTargetEntry.uuid,
    fileRefs[DOWNLOAD_ACTIVITY_FILES.attributes],
    DOWNLOAD_ACTIVITY_FILES.attributes,
  );
  ensureSourceInTarget(
    project,
    extensionTargetEntry.uuid,
    fileRefs[DOWNLOAD_ACTIVITY_FILES.widget],
    DOWNLOAD_ACTIVITY_FILES.widget,
  );
  ensureSourceInTarget(
    project,
    extensionTargetEntry.uuid,
    fileRefs[DOWNLOAD_ACTIVITY_FILES.bundle],
    DOWNLOAD_ACTIVITY_FILES.bundle,
  );
  ensureBuildPhase(project, extensionTargetEntry.uuid, 'PBXFrameworksBuildPhase', 'Frameworks');
  ensureTargetDependency(project, appTargetUuid, extensionTargetEntry.uuid);
  configureExtensionBuildSettings(
    project,
    appTarget,
    extensionTargetEntry.target,
    fallbackBundleId,
  );
  configureEmbedExtensionPhase(project, appTargetUuid, extensionTargetEntry.target);

  const projectObject = project.pbxProjectSection()[project.getFirstProject().uuid];
  projectObject.attributes = projectObject.attributes ?? {};
  projectObject.attributes.TargetAttributes = projectObject.attributes.TargetAttributes ?? {};
  projectObject.attributes.TargetAttributes[extensionTargetEntry.uuid] = {
    CreatedOnToolsVersion: '16.0',
  };

  return project;
}

function removeAppTargetInheritedLdFlags(project) {
  const configurations = project.pbxXCBuildConfigurationSection();
  if (!configurations) {
    return project;
  }

  for (const section of Object.values(configurations)) {
    if (!section || !section.buildSettings) {
      continue;
    }

    const buildSettings = section.buildSettings;
    if (typeof buildSettings?.PRODUCT_NAME === 'undefined') {
      continue;
    }

    if (!Array.isArray(buildSettings.OTHER_LDFLAGS)) {
      continue;
    }

    buildSettings.OTHER_LDFLAGS = buildSettings.OTHER_LDFLAGS.filter(
      (flag) => !APP_TARGET_INHERITED_LD_FLAGS.includes(unquotePbxValue(flag)),
    );
  }

  return project;
}

module.exports = {
  APP_TARGET_INHERITED_LD_FLAGS,
  FMT_CONSTEVAL_PATCH,
  IOS_BACKGROUND_MODES,
  PODS_TON_DUPLICATE_LD_FLAGS,
  PODS_TON_LD_FLAGS_PATCH,
  ensureIosDownloadActivityTarget,
  insertFmtPodfilePatch,
  insertPodsTonLdFlagsPodfilePatch,
  mergeStringArray,
  removeAppTargetInheritedLdFlags,
};
