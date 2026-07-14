const {
  DOWNLOAD_ACTIVITY_FILES,
  DOWNLOAD_ACTIVITY_SOURCE_ROOT,
  DOWNLOAD_ACTIVITY_TARGET_NAME,
} = require('./with-ton-ios-build-config');

function unquotePbxValue(value) {
  return typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : value;
}

function isCommentKey(key) {
  return key.endsWith('_comment');
}

function findNativeTarget(project, name) {
  for (const [key, target] of Object.entries(project.pbxNativeTargetSection())) {
    if (!isCommentKey(key) && target && unquotePbxValue(target.name) === name) {
      return { target, uuid: key };
    }
  }
  return null;
}

function ensureProjectSection(project, sectionName) {
  const objects = project.hash.project.objects;
  objects[sectionName] = objects[sectionName] ?? {};
  return objects[sectionName];
}

function ensureDownloadActivityGroup(project) {
  const groups = ensureProjectSection(project, 'PBXGroup');
  let groupUuid = Object.entries(groups).find(([key, group]) => (
    !isCommentKey(key) && group && unquotePbxValue(group.path) === DOWNLOAD_ACTIVITY_SOURCE_ROOT
  ))?.[0];
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
    groups[projectObject.mainGroup].children.push({
      value: groupUuid,
      comment: DOWNLOAD_ACTIVITY_TARGET_NAME,
    });
  }
  const group = groups[groupUuid];
  const fileReferences = ensureProjectSection(project, 'PBXFileReference');
  const fileRefByName = {};
  for (const fileName of Object.values(DOWNLOAD_ACTIVITY_FILES)) {
    const existing = group.children.find((child) => child.comment === fileName);
    if (existing) {
      fileRefByName[fileName] = existing.value;
      continue;
    }
    const uuid = project.generateUuid();
    fileReferences[uuid] = {
      isa: 'PBXFileReference',
      lastKnownFileType: fileName.endsWith('.plist') ? 'text.plist.xml' : 'sourcecode.swift',
      path: fileName,
      sourceTree: '"<group>"',
    };
    fileReferences[`${uuid}_comment`] = fileName;
    group.children.push({ value: uuid, comment: fileName });
    fileRefByName[fileName] = uuid;
  }
  return fileRefByName;
}

function findBuildPhase(project, targetUuid, phaseType) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const phases = ensureProjectSection(project, phaseType);
  return target.buildPhases.map((ref) => phases[ref.value]).find(Boolean) ?? null;
}

function ensureBuildPhase(project, targetUuid, phaseType, name) {
  return findBuildPhase(project, targetUuid, phaseType)
    ?? project.addBuildPhase([], phaseType, name, targetUuid).buildPhase;
}

function ensureSourceInTarget(project, targetUuid, fileRefUuid, fileName) {
  const sources = ensureBuildPhase(project, targetUuid, 'PBXSourcesBuildPhase', 'Sources');
  const buildFiles = ensureProjectSection(project, 'PBXBuildFile');
  if (sources.files.some((file) => buildFiles[file.value]?.fileRef === fileRefUuid)) return;
  const uuid = project.generateUuid();
  buildFiles[uuid] = { isa: 'PBXBuildFile', fileRef: fileRefUuid, fileRef_comment: fileName };
  buildFiles[`${uuid}_comment`] = `${fileName} in Sources`;
  sources.files.push({ value: uuid, comment: `${fileName} in Sources` });
}

function targetBuildSettingsByName(project, target) {
  const lists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const result = {};
  for (const ref of lists[target.buildConfigurationList].buildConfigurations) {
    result[ref.comment] = configurations[ref.value].buildSettings;
  }
  return result;
}

function ensureTargetDependency(project, appTargetUuid, extensionTargetUuid) {
  ensureProjectSection(project, 'PBXContainerItemProxy');
  const dependencies = ensureProjectSection(project, 'PBXTargetDependency');
  const appTarget = project.pbxNativeTargetSection()[appTargetUuid];
  if (!appTarget.dependencies.some((ref) => dependencies[ref.value]?.target === extensionTargetUuid)) {
    project.addTargetDependency(appTargetUuid, [extensionTargetUuid]);
  }
}

module.exports = {
  ensureBuildPhase,
  ensureDownloadActivityGroup,
  ensureProjectSection,
  ensureSourceInTarget,
  ensureTargetDependency,
  findNativeTarget,
  targetBuildSettingsByName,
  unquotePbxValue,
};
