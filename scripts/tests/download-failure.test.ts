import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  isAgeRestrictedDownloadError,
  toDownloadFailureMessage,
} from '../../packages/core/src/utils/download-failure.ts';
import { DOWNLOAD_RETRY_MAX } from '../../packages/core/src/utils/constants.ts';
import { shouldRetryQueueFailure } from '../../packages/mobile/src/services/download-queue/failure-policy.ts';

test('recognizes common YouTube age restriction messages', () => {
  assert.equal(isAgeRestrictedDownloadError('Sign in to confirm your age'), true);
  assert.equal(isAgeRestrictedDownloadError('This video is age-restricted'), true);
  assert.equal(isAgeRestrictedDownloadError('LOGIN_REQUIRED'), false);
  assert.equal(
    toDownloadFailureMessage('This video may be inappropriate for some users. Confirm your age.'),
    AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  );
});

test('formats common source failures for the Downloads UI', () => {
  assert.equal(
    toDownloadFailureMessage('ERROR: Private video. Sign in if you have access.'),
    'This YouTube video is private and cannot be downloaded.',
  );
  assert.equal(
    toDownloadFailureMessage('No YouTube match found for "Artist - Song"'),
    'No suitable YouTube match was found for this song.',
  );
  assert.equal(
    toDownloadFailureMessage('ERROR: Video unavailable. This video has been removed.'),
    'This YouTube video is unavailable or has been removed.',
  );
  assert.equal(
    toDownloadFailureMessage('[provider_exhausted] Could not resolve audio URL'),
    'The source rejected the download link. Use Retry to request a new link.',
  );
  assert.equal(
    toDownloadFailureMessage('Download failed: HTTP 404'),
    'The download URL is no longer available.',
  );
  assert.equal(
    toDownloadFailureMessage('ERROR: parser failed for https://example.test/audio?token=secret'),
    'Download failed: parser failed for the source URL',
  );
});

test('keeps the existing initial attempt plus two automatic retries', () => {
  assert.equal(DOWNLOAD_RETRY_MAX, 2);
  assert.equal(DOWNLOAD_RETRY_MAX + 1, 3);
  assert.equal(shouldRetryQueueFailure(AGE_RESTRICTED_DOWNLOAD_MESSAGE), false);
  assert.equal(shouldRetryQueueFailure('Network request failed'), true);
});
