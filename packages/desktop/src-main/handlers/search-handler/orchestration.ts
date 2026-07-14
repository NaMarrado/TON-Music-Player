import {
  SearchProviderQueryAliases,
  relaxSearchQuery,
  type SearchResult,
  type SearchSource,
  type SearchSourceEvent,
} from '@ton/core';

const providerQueryAliases = new SearchProviderQueryAliases();

class SearchTaskCancelledError extends Error {
  override readonly name = 'SearchTaskCancelledError';
}

export type SearchProviderPage = {
  results: SearchResult[];
  hasMore: boolean;
};

export type SearchProviderTask = {
  source: SearchSource;
  offset: number;
  deadlineMs?: number;
  run: (signal: AbortSignal) => Promise<SearchProviderPage>;
};

export async function settleSearchProviderTasks(
  requestId: number,
  tasks: SearchProviderTask[],
  parentSignal: AbortSignal,
  onSettled: (event: SearchSourceEvent) => void,
): Promise<Record<string, string>> {
  const sourceErrors: Record<string, string> = {};

  await Promise.all(tasks.map(async (task) => {
    try {
      const page = await runWithDeadline(task.run, parentSignal, task.deadlineMs);
      onSettled({
        requestId,
        source: task.source,
        status: 'success',
        results: page.results,
        offset: task.offset,
        hasMore: page.hasMore,
      });
    } catch (error) {
      const cancelled = parentSignal.aborted || error instanceof SearchTaskCancelledError;
      const message = error instanceof Error ? error.message : String(error);
      if (!cancelled) sourceErrors[task.source] = message;
      onSettled({
        requestId,
        source: task.source,
        status: cancelled ? 'cancelled' : 'error',
        results: [],
        offset: task.offset,
        hasMore: false,
        ...(cancelled ? {} : { error: message }),
      });
    }
  }));

  return sourceErrors;
}

export async function searchWithRelaxedRetry(
  source: SearchSource,
  query: string,
  offset: number,
  signal: AbortSignal,
  search: (query: string, signal: AbortSignal) => Promise<SearchProviderPage>,
): Promise<SearchProviderPage> {
  if (offset > 0) {
    return search(providerQueryAliases.resolve(source, query), signal);
  }

  providerQueryAliases.forget(source, query);
  const firstPage = await search(query, signal);
  if (firstPage.results.length > 0) {
    providerQueryAliases.remember(source, query, query);
    return firstPage;
  }

  const relaxedQuery = relaxSearchQuery(query);
  if (!relaxedQuery || relaxedQuery === query) return firstPage;
  if (signal.aborted) throw new Error('Cancelled');
  const relaxedPage = await search(relaxedQuery, signal);
  if (relaxedPage.results.length > 0 || relaxedPage.hasMore) {
    providerQueryAliases.remember(source, query, relaxedQuery);
  }
  return relaxedPage;
}

export function resetSearchProviderQueryAliases(): void {
  providerQueryAliases.clear();
}

function runWithDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal,
  deadlineMs?: number,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      parentSignal.removeEventListener('abort', onParentAbort);
      controller.signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(
      timedOut
        ? new Error('Search provider timed out')
        : new SearchTaskCancelledError('Cancelled'),
    ));
    const onParentAbort = () => controller.abort();
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
    controller.signal.addEventListener('abort', onAbort, { once: true });

    if (deadlineMs != null) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, deadlineMs);
    }
    if (parentSignal.aborted) controller.abort();

    Promise.resolve()
      .then(() => run(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
  });
}
