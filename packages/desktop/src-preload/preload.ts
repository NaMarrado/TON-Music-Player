import { contextBridge, ipcRenderer } from 'electron';
import {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_ON_CHANNELS,
  type AllowedInvokeChannel,
  type AllowedOnChannel,
} from '../src/shared/ipc-channels';

const listenerMap = new WeakMap<
  (...args: unknown[]) => void,
  (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
>();

const api = {
  invoke: (channel: AllowedInvokeChannel, ...args: unknown[]): Promise<unknown> => {
    if (!(ALLOWED_INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: AllowedOnChannel, callback: (...args: unknown[]) => void): void => {
    if (!(ALLOWED_ON_CHANNELS as readonly string[]).includes(channel)) return;
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on(channel, wrapper);
  },
  off: (channel: AllowedOnChannel, callback: (...args: unknown[]) => void): void => {
    const wrapper = listenerMap.get(callback);
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper);
      listenerMap.delete(callback);
    }
  },
};

contextBridge.exposeInMainWorld('api', api);
