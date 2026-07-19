let cloudDbTail: Promise<void> = Promise.resolve();

export async function runMobileCloudDbLane<T>(run: () => Promise<T>): Promise<T> {
  const previous = cloudDbTail;
  let release!: () => void;
  cloudDbTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}
