import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRequiredAacBitrate,
  getYtDlpAudioFormatSelector,
} from '../../packages/desktop/src-main/services/downloader/audio-policy.ts';

test('SoundCloud accepts its best audio source while other providers remain M4A-only', () => {
  assert.equal(
    getYtDlpAudioFormatSelector('soundcloud'),
    'bestaudio[ext=m4a][acodec^=mp4a]/bestaudio',
  );
  assert.equal(
    getYtDlpAudioFormatSelector('youtube'),
    'bestaudio[ext=m4a][acodec^=mp4a]',
  );
  assert.equal(
    getYtDlpAudioFormatSelector('spotify'),
    'bestaudio[ext=m4a][acodec^=mp4a]',
  );
});

test('normal always encodes 96 kbps M4A and best only converts incompatible sources', () => {
  assert.equal(getRequiredAacBitrate('normal', '.m4a'), '96k');
  assert.equal(getRequiredAacBitrate('normal', '.mp3'), '96k');
  assert.equal(getRequiredAacBitrate('best_compatible', '.m4a'), null);
  assert.equal(getRequiredAacBitrate('best_compatible', '.mp3'), '192k');
});
