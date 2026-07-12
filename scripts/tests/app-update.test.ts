import assert from 'node:assert/strict';
import test from 'node:test';
import { checkForAppUpdate } from '../../packages/core/src/services/app-update.ts';
import type {
  UpdateFetch,
  UpdateFetchResponse,
  UpdateManifest,
} from '../../packages/core/src/services/app-update-types.ts';

function response(status: number, body: unknown): UpdateFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

const publishedManifest: UpdateManifest = {
  version: '1.0.17',
  detailsUrl: 'https://github.com/NaMarrado/TON-Music-Player/releases/tag/v1.0.17',
  desktop: {
    darwin: {
      fileName: 'TON-macos.dmg',
      url: 'https://github.com/NaMarrado/TON-Music-Player/releases/download/v1.0.17/TON-macos.dmg',
    },
  },
};

test('uses the published manifest as the only production update source', async () => {
  const requests: string[] = [];
  const fetcher: UpdateFetch = async (input) => {
    requests.push(input);
    return response(200, publishedManifest);
  };

  const update = await checkForAppUpdate('1.0.16', fetcher, {
    platform: 'desktop-darwin',
  });

  assert.equal(update.hasUpdate, true);
  assert.equal(update.latestVersion, '1.0.17');
  assert.equal(update.source, 'manifest');
  assert.equal(update.canDownload, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? '', /update\.json/);
});

test('does not announce package.json version when the release feed is unavailable', async () => {
  const requests: string[] = [];
  const fetcher: UpdateFetch = async (input) => {
    requests.push(input);
    if (input.includes('package.json')) {
      return response(200, { version: '9.9.9' });
    }
    return response(404, null);
  };

  await assert.rejects(
    checkForAppUpdate('1.0.16', fetcher, { platform: 'android' }),
    /published update manifest/,
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? '', /update\.json/);
});

test('keeps explicit local update simulation available for development', async () => {
  const fetcher: UpdateFetch = async () => response(404, null);
  const update = await checkForAppUpdate('1.0.16', fetcher, {
    fallbackManifest: {
      version: '1.0.99',
      android: {
        fileName: 'simulation.apk',
        url: 'https://example.invalid/simulation.apk',
      },
    },
    platform: 'android',
  });

  assert.equal(update.hasUpdate, true);
  assert.equal(update.source, 'simulation');
  assert.equal(update.canDownload, true);
});
