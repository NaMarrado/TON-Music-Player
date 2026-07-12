import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const electronViteRoot = dirname(require.resolve('electron-vite/package.json'));
const electronViteCli = join(electronViteRoot, 'bin', 'electron-vite.js');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');

const env = {
  ...process.env,
  TON_SMOKE: 'handlers',
};
delete env.ELECTRON_RUN_AS_NODE;

const build = spawn(process.execPath, [electronViteCli, 'build'], {
  cwd: packageDir,
  env,
  stdio: 'inherit',
});

build.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code !== 0) {
    process.exit(code ?? 1);
    return;
  }

  const electronArgs = process.platform === 'linux' ? ['.', '--no-sandbox'] : ['.'];
  const child = spawn(electronBinary, electronArgs, {
    cwd: packageDir,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (childCode, childSignal) => {
    if (childSignal) {
      process.kill(process.pid, childSignal);
      return;
    }
    process.exit(childCode ?? 1);
  });
});
