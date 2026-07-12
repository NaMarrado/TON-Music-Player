#!/usr/bin/env node

import {
  buildUpdateManifest,
  getReleaseUrl,
  normalizeVersion,
  readJson,
} from './release-config.mjs';

function parseArgs(argv) {
  const options = {
    live: false,
    path: 'update.json',
  };

  for (const arg of argv) {
    if (arg === '--live') {
      options.live = true;
    } else if (!arg.startsWith('--')) {
      options.path = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);

  if (actualJson !== expectedJson) {
    throw new Error(`${label} does not match the canonical release manifest.\nExpected:\n${expectedJson}\nActual:\n${actualJson}`);
  }
}

async function assertUrlAvailable(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  if (![200, 302, 303, 307, 308].includes(response.status)) {
    throw new Error(`Release URL is not available: ${url} returned ${response.status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readJson(options.path);
  const version = normalizeVersion(manifest.version);
  const expected = buildUpdateManifest(version);

  assertDeepEqual(manifest, expected, options.path);

  if (options.live) {
    await assertUrlAvailable(getReleaseUrl(version));
    const urls = [
      manifest.desktop.darwin.url,
      manifest.desktop.win32.url,
      manifest.desktop.linux.url,
      manifest.android.url,
    ];
    for (const url of urls) {
      await assertUrlAvailable(url);
    }
  }

  console.log(`Update manifest is valid for TON ${version}`);
}

main();
