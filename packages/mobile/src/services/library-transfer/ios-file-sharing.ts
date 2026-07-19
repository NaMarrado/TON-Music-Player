import { NativeModules, Platform } from 'react-native';

type IosLibraryFileSharingModule = {
  shareFiles(files: IosLibraryExportFile[]): Promise<boolean>;
};

export type IosLibraryExportFile = {
  fileName: string;
  sourceUri: string;
};

export async function shareIosLibraryExportFiles(files: IosLibraryExportFile[]): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    throw new Error('iOS file sharing is unavailable on this platform');
  }
  const module = NativeModules.IosBackgroundDownloads as
    | IosLibraryFileSharingModule
    | undefined;
  if (!module?.shareFiles) {
    throw new Error('iOS file sharing module is unavailable');
  }
  return module.shareFiles(files);
}
