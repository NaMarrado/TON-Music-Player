import {
  acknowledgeIosBackgroundSettled,
  beginIosBackgroundDownloadActivity,
  cancelIosBackgroundDownload,
  endIosBackgroundDownloadActivity,
  getIosBackgroundDownloadSnapshot,
  initializeIosBackgroundDownloadsNative,
  isIosBackgroundDownloadsAvailable,
  recoverIosBackgroundDownload,
  startIosBackgroundDownload,
  subscribeToIosBackgroundDownloads,
} from './ios-background-native';

export {
  acknowledgeIosBackgroundSettled,
  beginIosBackgroundDownloadActivity,
  cancelIosBackgroundDownload,
  endIosBackgroundDownloadActivity,
  getIosBackgroundDownloadSnapshot,
  initializeIosBackgroundDownloadsNative,
  isIosBackgroundDownloadsAvailable,
  recoverIosBackgroundDownload,
  startIosBackgroundDownload,
  subscribeToIosBackgroundDownloads,
};
export type {
  IosBackgroundDownloadActivityRequest,
  IosBackgroundDownloadEvent,
  IosBackgroundDownloadRequest,
  IosBackgroundDownloadSnapshot,
  IosBackgroundDownloadSnapshotItem,
  IosBackgroundDownloadState,
} from './ios-background-types';
