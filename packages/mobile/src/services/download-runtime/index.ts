import { Platform } from 'react-native';
import type { DownloadRuntimeModule } from './types';

export { openDownloadRuntimeSettings } from './open-settings';
export type {
  DownloadHeadlessTaskPayload,
  DownloadRuntimeAction,
  DownloadRuntimePermissionNoticeKey,
} from './types';

const runtime = (Platform.OS === 'ios'
  ? require('./ios')
  : require('./android')) as DownloadRuntimeModule;

export const getDownloadRuntimePermissionNoticeKey =
  runtime.getDownloadRuntimePermissionNoticeKey;
export const initializeDownloadRuntime = runtime.initializeDownloadRuntime;
export const ensureDownloadRuntimePermission = runtime.ensureDownloadRuntimePermission;
export const maybeStartDownloadBackgroundWork = runtime.maybeStartDownloadBackgroundWork;
export const stopDownloadBackgroundWorkIfIdle = runtime.stopDownloadBackgroundWorkIfIdle;
export const syncDownloadQueueRuntimeSnapshot = runtime.syncDownloadQueueRuntimeSnapshot;
export const runDownloadRuntimeHeadlessTask = runtime.runDownloadRuntimeHeadlessTask;
