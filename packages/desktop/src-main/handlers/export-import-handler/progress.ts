import type { ProgressPayload } from './types';

export function createProgressSender(
  sender: Electron.WebContents,
  channel: string,
): (data: ProgressPayload) => void {
  return (data) => {
    sender.send(channel, data);
  };
}
