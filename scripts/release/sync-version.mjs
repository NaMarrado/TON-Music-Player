#!/usr/bin/env node

import {
  bumpPatch,
  getHighestKnownVersion,
  getPackageVersion,
  normalizeVersion,
} from './release-config.mjs';
import { assertFilesSynced } from './sync-version-check.mjs';
import { syncFiles } from './sync-version-files.mjs';

function parseArgs(argv) {
  const options = {
    bump: null,
    check: false,
    fromGitTags: false,
    skipManifest: false,
    version: null,
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--bump' || arg === '--version') {
      options[arg === '--bump' ? 'bump' : 'version'] = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--check') options.check = true;
    else if (arg === '--from-git-tags') options.fromGitTags = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--write') options.write = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.write && options.check) throw new Error('Use either --write or --check, not both.');
  if (!options.write && !options.check) throw new Error('Pass --write to update files or --check to validate/dry-run.');
  if (options.bump && options.bump !== 'patch') {
    throw new Error(`Unsupported bump mode: ${options.bump}`);
  }
  return options;
}

function resolveTargetVersion(options) {
  const explicit = options.version ? normalizeVersion(options.version) : null;
  const base = explicit ?? getHighestKnownVersion({ includeTags: options.fromGitTags });
  return options.bump === 'patch' ? bumpPatch(base) : base;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentVersion = getPackageVersion();
  const targetVersion = resolveTargetVersion(options);
  const includeManifest = !options.skipManifest;
  if (options.write) {
    syncFiles(targetVersion, includeManifest);
    console.log(`Synced TON release version ${targetVersion}`);
    return;
  }
  assertFilesSynced(options.bump ? currentVersion : targetVersion, includeManifest);
  console.log(`Current version: ${currentVersion}`);
  console.log(`Target version: ${targetVersion}`);
}

main();
