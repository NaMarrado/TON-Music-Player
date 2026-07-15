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
  runtime: 'TONDownloadActivityRuntime.swift',
  widget: 'TONDownloadLiveActivity.swift',
};

function toRubyStringList(values) {
  return `[${values.map((value) => `'${value.replace(/'/g, "\\'")}'`).join(', ')}]`;
}

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

function mergeStringArray(existingValues, requiredValues) {
  const merged = Array.isArray(existingValues) ? existingValues.filter(Boolean) : [];
  for (const value of requiredValues) {
    if (!merged.includes(value)) merged.push(value);
  }
  return merged;
}

const POST_INSTALL_ANCHOR = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )
`;

function insertPodfilePatch(contents, marker, patch) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(POST_INSTALL_ANCHOR)) {
    throw new Error('Unable to find react_native_post_install block in generated Podfile.');
  }
  return contents.replace(POST_INSTALL_ANCHOR, `${POST_INSTALL_ANCHOR}\n${patch}`);
}

function insertFmtPodfilePatch(contents) {
  return insertPodfilePatch(contents, "installer.sandbox.pod_dir('fmt')", FMT_CONSTEVAL_PATCH);
}

function insertPodsTonLdFlagsPodfilePatch(contents) {
  return insertPodfilePatch(contents, 'pods_ton_duplicate_ld_flags', PODS_TON_LD_FLAGS_PATCH);
}

function removeAppTargetInheritedLdFlags(project) {
  const configurations = project.pbxXCBuildConfigurationSection();
  if (!configurations) return project;
  for (const section of Object.values(configurations)) {
    const settings = section?.buildSettings;
    if (typeof settings?.PRODUCT_NAME === 'undefined' || !Array.isArray(settings.OTHER_LDFLAGS)) {
      continue;
    }
    settings.OTHER_LDFLAGS = settings.OTHER_LDFLAGS.filter((flag) => {
      const value = typeof flag === 'string' ? flag.replace(/^"(.*)"$/, '$1') : flag;
      return !APP_TARGET_INHERITED_LD_FLAGS.includes(value);
    });
  }
  return project;
}

module.exports = {
  APP_TARGET_INHERITED_LD_FLAGS,
  DOWNLOAD_ACTIVITY_FILES,
  DOWNLOAD_ACTIVITY_INFO_PLIST,
  DOWNLOAD_ACTIVITY_SOURCE_ROOT,
  DOWNLOAD_ACTIVITY_TARGET_NAME,
  FMT_CONSTEVAL_PATCH,
  IOS_BACKGROUND_MODES,
  PODS_TON_DUPLICATE_LD_FLAGS,
  PODS_TON_LD_FLAGS_PATCH,
  insertFmtPodfilePatch,
  insertPodsTonLdFlagsPodfilePatch,
  mergeStringArray,
  removeAppTargetInheritedLdFlags,
};
