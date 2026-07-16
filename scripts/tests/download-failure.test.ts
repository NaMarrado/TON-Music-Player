import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LocaleResourceObject } from '../../packages/core/src/i18n/types.ts';
import { createI18nInstance } from '../../packages/core/src/i18n/setup.ts';
import { addPreparedResourceBundle } from '../../packages/core/src/i18n/text-direction.ts';
import type { SupportedLanguage } from '../../packages/core/src/i18n/languages.ts';
import {
  AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  getDownloadFailureReason,
  getDownloadFailureTranslationKey,
  isAgeRestrictedDownloadError,
  toDownloadFailureMessage,
} from '../../packages/core/src/utils/download-failure.ts';
import {
  DOWNLOAD_RETRY_DELAY_MS,
  DOWNLOAD_RETRY_MAX,
} from '../../packages/core/src/utils/constants.ts';
import { getDownloadSlotsToFill } from '../../packages/core/src/utils/download-queue-policy.ts';
import { shouldRetryQueueFailure } from '../../packages/mobile/src/services/download-queue/failure-policy.ts';
import { getRetryDelay } from '../../packages/mobile/src/services/download-queue/timing.ts';

test('recognizes common YouTube age restriction messages', () => {
  assert.equal(isAgeRestrictedDownloadError('Sign in to confirm your age'), true);
  assert.equal(isAgeRestrictedDownloadError('This video is age-restricted'), true);
  assert.equal(isAgeRestrictedDownloadError('LOGIN_REQUIRED'), false);
  assert.equal(
    toDownloadFailureMessage('This video may be inappropriate for some users. Confirm your age.'),
    AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  );
  assert.equal(getDownloadFailureReason(AGE_RESTRICTED_DOWNLOAD_MESSAGE), 'ageRestricted');
  assert.equal(
    getDownloadFailureTranslationKey(AGE_RESTRICTED_DOWNLOAD_MESSAGE),
    'failureReasons.ageRestricted',
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
  assert.equal(getRetryDelay(), DOWNLOAD_RETRY_DELAY_MS);
  assert.equal(getRetryDelay(), 5_000);
});

test('fills exactly two concurrent download slots', () => {
  assert.equal(getDownloadSlotsToFill(0), 2);
  assert.equal(getDownloadSlotsToFill(1), 1);
  assert.equal(getDownloadSlotsToFill(2), 0);
  assert.equal(getDownloadSlotsToFill(3), 0);
});

test('resolves localized download failures in every supported language', async () => {
  const languages: SupportedLanguage[] = [
    'en', 'cs', 'de', 'es', 'fr', 'it', 'pl', 'pt', 'ru', 'ja', 'zh', 'ar', 'he',
  ];
  const instance = createI18nInstance();

  for (const language of languages) {
    const localeUrl = new URL(
      `../../packages/desktop/src/locales/${language}/pages/downloads.json`,
      import.meta.url,
    );
    const resources = JSON.parse(readFileSync(localeUrl, 'utf8')) as LocaleResourceObject;
    addPreparedResourceBundle(instance, language, 'downloads-test', resources);
    await instance.changeLanguage(language);

    const translated = instance.t('failureReasons.ageRestricted', { ns: 'downloads-test' });
    const expected = (resources.failureReasons as LocaleResourceObject).ageRestricted;
    assert.equal(typeof expected, 'string');
    assert.equal(translated.includes(expected), true, language);
    assert.notEqual(translated, 'failureReasons.ageRestricted', language);
  }
});
