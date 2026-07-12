#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  REPO_ROOT,
  getCanonicalAssetNames,
  normalizeVersion,
} from './release-config.mjs';

const ARTIFACT_TYPES = [
  { key: 'macos', extension: '.dmg' },
  { key: 'windows', extension: '.exe' },
  { key: 'linux', extension: '.AppImage' },
  { key: 'android', extension: '.apk' },
];

function parseArgs(argv) {
  const options = {
    input: 'release-input',
    output: 'release/github',
    version: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--input':
        options.input = argv[index + 1] ?? null;
        index += 1;
        break;
      case '--output':
        options.output = argv[index + 1] ?? null;
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
    throw new Error('Missing --version.');
  }

  return {
    ...options,
    version: normalizeVersion(options.version),
  };
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function findArtifact(files, extension) {
  const matches = files.filter((file) => file.endsWith(extension) && !file.endsWith('.blockmap'));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${extension} artifact, found ${matches.length}: ${matches.join(', ')}`);
  }

  return matches[0];
}

function resolvePath(path) {
  return isAbsolute(path) ? path : join(REPO_ROOT, path);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputDir = resolvePath(options.input);
  const outputDir = resolvePath(options.output);

  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
    throw new Error(`Release artifact input directory does not exist: ${inputDir}`);
  }

  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const files = walkFiles(inputDir);
  const canonicalNames = getCanonicalAssetNames(options.version);
  const staged = [];

  for (const type of ARTIFACT_TYPES) {
    const source = findArtifact(files, type.extension);
    const destination = join(outputDir, canonicalNames[type.key]);
    copyFileSync(source, destination);
    staged.push(destination);
  }

  const checksumLines = staged
    .sort((left, right) => left.localeCompare(right))
    .map((file) => `${sha256(file)} *${basename(file)}`);

  writeFileSync(join(outputDir, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, 'utf8');

  for (const file of staged) {
    console.log(file);
  }
  console.log(join(outputDir, 'SHA256SUMS'));
}

main();
