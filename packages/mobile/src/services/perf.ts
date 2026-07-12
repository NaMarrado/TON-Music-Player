const PERF_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_TON_PERF === '1';

const counters = new Map<string, number>();

export function isPerfEnabled(): boolean {
  return PERF_ENABLED;
}

export function countPerfEvent(name: string, by = 1): void {
  if (!PERF_ENABLED) return;
  const nextValue = (counters.get(name) ?? 0) + by;
  counters.set(name, nextValue);
  if (nextValue === 1 || nextValue % 25 === 0) {
    console.log(`[PERF][mobile] ${name}: ${nextValue}`);
  }
}

export function markPerf(name: string, detail?: string): void {
  if (!PERF_ENABLED) return;
  console.log(`[PERF][mobile] ${name}${detail ? `: ${detail}` : ''}`);
}

export async function measurePerfAsync<T>(name: string, run: () => Promise<T>): Promise<T> {
  if (!PERF_ENABLED) {
    return run();
  }

  const start = Date.now();
  try {
    return await run();
  } finally {
    console.log(`[PERF][mobile] ${name} ${Date.now() - start}ms`);
  }
}
