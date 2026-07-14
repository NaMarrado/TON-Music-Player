import type { EmitterSubscription } from 'react-native';
import type { QueueRuntimeState } from './runtime';
import type { QueueSettlementFacade } from './settlement';

export interface IosBackgroundQueueFacade extends QueueSettlementFacade {
  runtime: QueueRuntimeState;
}

export const iosBackgroundState = {
  eventsSubscription: null as EmitterSubscription | null,
  restorePromise: null as Promise<void> | null,
  reconcileTimer: null as ReturnType<typeof setInterval> | null,
  reconcileInFlight: false,
  settlingItemIds: new Set<number>(),
  failedStrategiesByItemId: new Map<number, Set<string>>(),
  foregroundPromiseItemIds: new Set<number>(),
  candidateRetryPromisesByItemId: new Map<number, Promise<boolean>>(),
  candidateRetryErrorsByItemId: new Map<number, string>(),
};
