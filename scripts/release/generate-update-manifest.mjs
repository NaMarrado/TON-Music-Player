#!/usr/bin/env node

import {
  buildUpdateManifest,
  normalizeVersion,
  writeJson,
} from './release-config.mjs';

function parseArgs(argv) {
  const options = {
    output: 'update.json',
    version: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--output':
        options.output = argv[index + 1] ?? '';
        index += 1;
        break;
      case '--version':
        options.version = argv[index + 1] ?? null;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.version) {
    throw new Error('Pass --version to generate the update manifest.');
  }
  if (!options.output) {
    throw new Error('The manifest output path cannot be empty.');
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const version = normalizeVersion(options.version);
writeJson(options.output, buildUpdateManifest(version));
console.log(`Generated ${options.output} for TON ${version}`);
