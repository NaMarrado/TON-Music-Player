import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function copyIfMissingOrChanged(source, destination) {
  if (existsSync(destination) && fileHash(source) === fileHash(destination)) {
    return false;
  }

  copyFileSync(source, destination);
  return true;
}

function main() {
  let packageRoot;
  try {
    packageRoot = dirname(require.resolve('expo-sqlite/package.json'));
  } catch {
    return;
  }

  const vendorRoot = join(packageRoot, 'vendor', 'sqlite3');
  const iosRoot = join(packageRoot, 'ios');
  const files = ['sqlite3.c', 'sqlite3.h'];
  const copied = [];

  for (const file of files) {
    const source = join(vendorRoot, file);
    const destination = join(iosRoot, file);
    if (!existsSync(source)) {
      throw new Error(`Missing Expo SQLite vendor source: ${source}`);
    }
    if (copyIfMissingOrChanged(source, destination)) {
      copied.push(file);
    }
  }

  if (copied.length > 0) {
    console.log(`Prepared expo-sqlite iOS SQLite sources: ${copied.join(', ')}`);
  }
}

main();
