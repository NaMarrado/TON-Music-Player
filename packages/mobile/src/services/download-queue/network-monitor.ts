import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { getDownloadQueue } from '.';

export interface DownloadNetworkMonitor {
  ready: Promise<void>;
  stop: () => void;
}

export function isDownloadNetworkOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function startDownloadNetworkMonitor(): DownloadNetworkMonitor {
  const queue = getDownloadQueue();
  let active = true;
  let eventReceived = false;
  let readySettled = false;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const settleReady = () => {
    if (readySettled) {
      return;
    }
    readySettled = true;
    resolveReady();
  };

  const applyState = (state: NetInfoState) => {
    if (!active) {
      return;
    }
    if (isDownloadNetworkOnline(state)) {
      queue.goOnline();
    } else {
      queue.goOffline();
    }
  };

  const unsubscribe = NetInfo.addEventListener((state) => {
    eventReceived = true;
    applyState(state);
    settleReady();
  });

  void NetInfo.fetch()
    .then((state) => {
      if (!eventReceived) {
        applyState(state);
      }
      settleReady();
    })
    .catch(() => settleReady());

  return {
    ready,
    stop: () => {
      active = false;
      unsubscribe();
      settleReady();
    },
  };
}
