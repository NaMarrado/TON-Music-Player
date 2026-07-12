export const ANDROID_PROVIDER_ATTEMPT_LIMIT = 3;

export type AndroidProviderRecoveryAction =
  | 'fallback-mweb'
  | 'refresh-android-vr'
  | 'refresh-mweb'
  | 'stop-exhausted'
  | 'stop-http'
  | 'stop-rate-limited';

export function getAndroidProviderRecoveryAction(options: {
  attempt: number;
  forceFresh: boolean;
  status: number;
  strategy: string;
}): AndroidProviderRecoveryAction {
  if (options.status === 429) {
    return 'stop-rate-limited';
  }
  if (options.status !== 403) {
    return 'stop-http';
  }
  if (options.attempt + 1 >= ANDROID_PROVIDER_ATTEMPT_LIMIT) {
    return 'stop-exhausted';
  }

  if (options.strategy === 'ANDROID_VR') {
    return options.forceFresh ? 'fallback-mweb' : 'refresh-android-vr';
  }
  if (options.strategy === 'MWEB') {
    return options.forceFresh ? 'stop-exhausted' : 'refresh-mweb';
  }

  return 'stop-exhausted';
}
