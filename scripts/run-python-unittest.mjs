import { spawnSync } from 'node:child_process';

const testNames = process.argv.slice(2);
if (testNames.length === 0) {
  console.error('Usage: node scripts/run-python-unittest.mjs <unittest-name> [...]');
  process.exit(2);
}

const candidates = process.platform === 'win32'
  ? [
      { command: 'py', prefix: ['-3'] },
      { command: 'python3', prefix: [] },
      { command: 'python', prefix: [] },
    ]
  : [
      { command: 'python3', prefix: [] },
      { command: 'python', prefix: [] },
    ];

for (const candidate of candidates) {
  const result = spawnSync(
    candidate.command,
    [...candidate.prefix, '-m', 'unittest', ...testNames],
    { stdio: 'inherit' },
  );

  if (result.error?.code === 'ENOENT') {
    continue;
  }

  process.exit(result.status ?? 1);
}

console.error('A Python 3 interpreter is required to run the icon tests.');
process.exit(1);
