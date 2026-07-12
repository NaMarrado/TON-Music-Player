import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANDROID_VR_CLIENT,
  createAndroidVrContext,
  createAndroidVrHeaders,
  selectBestAndroidVrAudioFormat,
} from '../../packages/mobile/src/services/youtube-search/audio-strategies/android-vr-protocol.ts';
import { getAndroidCandidateViolation } from '../../packages/mobile/src/services/youtube-search/audio-strategies/android-candidate-policy.ts';
import {
  ANDROID_PROVIDER_ATTEMPT_LIMIT,
  getAndroidProviderRecoveryAction,
} from '../../packages/mobile/src/services/downloader/android-provider-recovery.ts';
import { createSingleFlightValue } from '../../packages/mobile/src/services/youtube-search/single-flight-value.ts';

test('uses the direct-format Android VR client profile', () => {
  assert.equal(ANDROID_VR_CLIENT.name, 'ANDROID_VR');
  assert.equal(ANDROID_VR_CLIENT.version, '1.65.10');
  assert.equal(ANDROID_VR_CLIENT.apiBaseUrl, 'https://youtubei.googleapis.com/youtubei/v1');
  assert.doesNotMatch(ANDROID_VR_CLIENT.userAgent, /iphone|\bios\b/i);
});

test('keeps server visitorData in both context and request headers', () => {
  const visitorData = 'server-issued-visitor-data';
  const context = createAndroidVrContext(visitorData);
  const headers = createAndroidVrHeaders(visitorData);

  assert.equal(context.client.visitorData, visitorData);
  assert.equal(headers['X-Goog-Visitor-Id'], visitorData);
  assert.equal(headers['X-YouTube-Client-Name'], '28');
  assert.equal(headers['X-YouTube-Client-Version'], '1.65.10');
});

test('selects only the highest-bitrate resolvable audio format', () => {
  const selected = selectBestAndroidVrAudioFormat({
    adaptiveFormats: [
      {
        bitrate: 900_000,
        itag: 22,
        mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
        url: 'https://example.test/video',
      },
      {
        bitrate: 320_000,
        itag: 141,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      },
      {
        bitrate: 136_000,
        itag: 251,
        mimeType: 'audio/webm; codecs="opus"',
        url: 'https://example.test/audio-136',
      },
      {
        bitrate: 160_000,
        itag: 250,
        mimeType: 'audio/webm; codecs="opus"',
        signatureCipher: 'url=https%3A%2F%2Fexample.test%2Faudio-160&s=x&sp=sig',
      },
    ],
  });

  assert.equal(selected?.itag, 250);
  assert.match(selected?.mimeType ?? '', /^audio\//);
});

test('rejects SABR-only audio metadata without a direct URL or cipher', () => {
  const selected = selectBestAndroidVrAudioFormat({
    adaptiveFormats: [
      {
        bitrate: 136_000,
        itag: 251,
        mimeType: 'audio/webm; codecs="opus"',
      },
    ],
  });

  assert.equal(selected, null);
});

test('rejects video, Apple, foreign-client, and foreign-token Android candidates', () => {
  const validVr = {
    headers: { 'User-Agent': 'Firefox Android media client' },
    mimeType: 'audio/webm; codecs="opus"',
    url: 'https://rr.example.googlevideo.com/videoplayback?c=ANDROID_VR',
  };

  assert.equal(getAndroidCandidateViolation('ANDROID_VR', validVr), null);
  assert.match(
    getAndroidCandidateViolation('ANDROID_VR', { ...validVr, mimeType: 'video/mp4' }) ?? '',
    /non-audio/,
  );
  assert.match(
    getAndroidCandidateViolation('ANDROID_VR', {
      ...validVr,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS)' },
    }) ?? '',
    /Apple User-Agent/,
  );
  assert.match(
    getAndroidCandidateViolation('ANDROID_VR', {
      ...validVr,
      url: 'https://rr.example.googlevideo.com/videoplayback?c=IOS',
    }) ?? '',
    /unexpected media client/,
  );
  assert.match(
    getAndroidCandidateViolation('ANDROID_VR', {
      ...validVr,
      url: 'https://rr.example.googlevideo.com/videoplayback?c=ANDROID_VR&pot=foreign',
    }) ?? '',
    /foreign PO token/,
  );
});

test('limits media rejection recovery to two retries and never retries 429', () => {
  assert.equal(ANDROID_PROVIDER_ATTEMPT_LIMIT, 3);
  assert.equal(getAndroidProviderRecoveryAction({
    attempt: 0,
    forceFresh: false,
    status: 403,
    strategy: 'ANDROID_VR',
  }), 'refresh-android-vr');
  assert.equal(getAndroidProviderRecoveryAction({
    attempt: 1,
    forceFresh: true,
    status: 403,
    strategy: 'ANDROID_VR',
  }), 'fallback-mweb');
  assert.equal(getAndroidProviderRecoveryAction({
    attempt: 2,
    forceFresh: true,
    status: 403,
    strategy: 'MWEB',
  }), 'stop-exhausted');
  assert.equal(getAndroidProviderRecoveryAction({
    attempt: 0,
    forceFresh: false,
    status: 429,
    strategy: 'ANDROID_VR',
  }), 'stop-rate-limited');
});

test('deduplicates concurrent visitor loads and refreshes after invalidation', async () => {
  let loadCount = 0;
  let releaseLoad: ((value: string) => void) | null = null;
  const session = createSingleFlightValue(() => {
    loadCount += 1;
    return new Promise<string>((resolve) => {
      releaseLoad = resolve;
    });
  });

  const first = session.get();
  const second = session.get();
  assert.equal(loadCount, 1);
  releaseLoad?.('visitor-one');
  assert.deepEqual(await Promise.all([first, second]), ['visitor-one', 'visitor-one']);
  assert.equal(await session.get(), 'visitor-one');
  assert.equal(loadCount, 1);

  session.invalidate();
  const refreshed = session.get();
  assert.equal(loadCount, 2);
  releaseLoad?.('visitor-two');
  assert.equal(await refreshed, 'visitor-two');
});
