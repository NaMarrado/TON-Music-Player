import { YouTubeResolverError } from '../errors';
import { createSingleFlightValue } from '../single-flight-value';
import {
  ANDROID_VR_CLIENT,
  createAndroidVrContext,
  createAndroidVrHeaders,
} from './android-vr-protocol';

type VisitorResponse = {
  responseContext?: {
    visitorData?: string;
  };
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('download_cancelled');
  }
}

async function waitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  if (!signal) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('download_cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

async function fetchAndroidVrVisitorData(): Promise<string> {
  const response = await fetch(
    `${ANDROID_VR_CLIENT.apiBaseUrl}/visitor_id?prettyPrint=false`,
    {
      body: JSON.stringify({ context: createAndroidVrContext() }),
      headers: createAndroidVrHeaders(),
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new YouTubeResolverError({
      canRefresh: response.status >= 500,
      message: `ANDROID_VR visitor_id returned HTTP ${response.status}`,
      stage: 'visitor',
      status: response.status,
      strategy: 'ANDROID_VR',
    });
  }

  const body = await response.json() as VisitorResponse;
  const visitorData = body.responseContext?.visitorData?.trim();
  if (!visitorData) {
    throw new YouTubeResolverError({
      canRefresh: true,
      message: 'ANDROID_VR visitor_id response did not contain visitorData',
      stage: 'visitor',
      strategy: 'ANDROID_VR',
    });
  }

  return visitorData;
}

const visitorSession = createSingleFlightValue(fetchAndroidVrVisitorData);

export async function getAndroidVrVisitorData(options: {
  forceFresh?: boolean;
  signal?: AbortSignal;
} = {}): Promise<string> {
  return waitWithAbort(
    visitorSession.get({ forceFresh: options.forceFresh }),
    options.signal,
  );
}

export function invalidateAndroidVrVisitorData(): void {
  visitorSession.invalidate();
}
