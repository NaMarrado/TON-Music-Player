const config = require('./with-ton-ios-build-config');
const { ensureIosDownloadActivityTarget } = require('./with-ton-ios-download-activity');

module.exports = {
  APP_TARGET_INHERITED_LD_FLAGS: config.APP_TARGET_INHERITED_LD_FLAGS,
  FMT_CONSTEVAL_PATCH: config.FMT_CONSTEVAL_PATCH,
  IOS_BACKGROUND_MODES: config.IOS_BACKGROUND_MODES,
  PODS_TON_DUPLICATE_LD_FLAGS: config.PODS_TON_DUPLICATE_LD_FLAGS,
  PODS_TON_LD_FLAGS_PATCH: config.PODS_TON_LD_FLAGS_PATCH,
  ensureIosDownloadActivityTarget,
  insertFmtPodfilePatch: config.insertFmtPodfilePatch,
  insertPodsTonLdFlagsPodfilePatch: config.insertPodsTonLdFlagsPodfilePatch,
  mergeStringArray: config.mergeStringArray,
  removeAppTargetInheritedLdFlags: config.removeAppTargetInheritedLdFlags,
};
