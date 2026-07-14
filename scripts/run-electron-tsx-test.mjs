import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const tsxCli = require.resolve('tsx/cli');
const testFiles = process.argv.slice(2);

if (testFiles.length === 0) {
  console.error('Usage: node scripts/run-electron-tsx-test.mjs <test-file> [...]');
  process.exit(2);
}

const child = spawn(electronBinary, [tsxCli, '--test', ...testFiles], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
