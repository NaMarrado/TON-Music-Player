import {
  cleanupHandlerSmokePaths,
  prepareHandlerSmokePaths,
  runHandlerSmoke,
} from '../smoke/handler-smoke';

export function prepareSmokeMode(): void {
  if (process.env.TON_SMOKE === 'handlers') {
    prepareHandlerSmokePaths();
  }
}

export function isHandlerSmokeMode(): boolean {
  return process.env.TON_SMOKE === 'handlers';
}

export async function runHandlerSmokeMode(): Promise<void> {
  const summary = await runHandlerSmoke();
  console.log('[TON_SMOKE] handler smoke passed');
  console.log(JSON.stringify(summary, null, 2));
}

export function cleanupSmokeMode(): void {
  if (process.env.TON_SMOKE === 'handlers') {
    cleanupHandlerSmokePaths();
  }
}
