#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const [, , appAsarPath] = process.argv;
const requireFromScript = createRequire(import.meta.url);
const { extractAll } = requireFromScript('@electron/asar');

if (!appAsarPath) {
  console.error('Usage: node scripts/verify_packaged_desktop_bundle.mjs <path-to-app.asar>');
  process.exit(1);
}

const resolvedAsarPath = resolve(appAsarPath);
if (!existsSync(resolvedAsarPath)) {
  console.error(`app.asar not found: ${resolvedAsarPath}`);
  process.exit(1);
}

const extractDir = mkdtempSync(join(tmpdir(), 'ton-packaged-bundle-'));
try {
  extractAll(resolvedAsarPath, extractDir);
} catch (error) {
  console.error(`Failed to extract app.asar: ${resolvedAsarPath}`);
  console.error(error);
  rmSync(extractDir, { recursive: true, force: true });
  process.exit(1);
}

const bundleRequireEntry = [
  join(extractDir, 'package.json'),
  join(extractDir, 'out', 'main', 'main.js'),
].find((candidate) => existsSync(candidate));

if (!bundleRequireEntry) {
  rmSync(extractDir, { recursive: true, force: true });
  console.error(`Unable to find a require entry inside extracted bundle: ${extractDir}`);
  process.exit(1);
}

const bundleRequire = createRequire(bundleRequireEntry);
const runtimeModules = ['archiver', 'zip-stream', 'archiver-utils', 'extract-zip'];

try {
  for (const moduleName of runtimeModules) {
    bundleRequire(moduleName);
    const resolvedPath = bundleRequire.resolve(moduleName);
    console.log(`resolved ${moduleName}: ${resolvedPath}`);
  }
} catch (error) {
  console.error('Packaged runtime module verification failed.');
  console.error(error);
  rmSync(extractDir, { recursive: true, force: true });
  process.exit(1);
}

rmSync(extractDir, { recursive: true, force: true });
console.log(`Verified packaged desktop bundle: ${resolvedAsarPath}`);
