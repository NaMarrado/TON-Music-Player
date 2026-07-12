export interface SingleFlightValue<T> {
  get(options?: { forceFresh?: boolean }): Promise<T>;
  invalidate(): void;
}

export function createSingleFlightValue<T>(
  load: () => Promise<T>,
): SingleFlightValue<T> {
  let cached: { generation: number; value: T } | null = null;
  let generation = 0;
  let pending: { generation: number; promise: Promise<T> } | null = null;

  const invalidate = () => {
    generation += 1;
    cached = null;
  };

  return {
    get(options = {}) {
      if (options.forceFresh) {
        invalidate();
      }

      if (cached?.generation === generation) {
        return Promise.resolve(cached.value);
      }

      if (!pending || pending.generation !== generation) {
        const requestGeneration = generation;
        const promise = load()
          .then((value) => {
            if (generation === requestGeneration) {
              cached = { generation: requestGeneration, value };
            }
            return value;
          })
          .finally(() => {
            if (pending?.promise === promise) {
              pending = null;
            }
          });
        pending = { generation: requestGeneration, promise };
      }

      return pending.promise;
    },
    invalidate,
  };
}
