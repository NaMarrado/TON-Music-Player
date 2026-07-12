import type { IpcMainInvokeEvent } from 'electron';
import type { ScanProgressSender } from './types';

export function createScanProgressSender(event: IpcMainInvokeEvent): ScanProgressSender {
  return (progress) => {
    event.sender.send('library:scan-progress', progress);
  };
}
