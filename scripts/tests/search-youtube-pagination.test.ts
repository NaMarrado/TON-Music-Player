import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resetYouTubeSearchSessions,
  searchYouTubePage as searchMobileYouTubePage,
} from '../../packages/mobile/src/services/youtube-search/search.ts';

test('mobile YouTube reuses its continuation session across pages', async () => {
  resetYouTubeSearchSessions();
  let initialSearchCalls = 0;
  let continuationCalls = 0;

  type MockPage = {
    results: Array<{
      type: string;
      id: string;
      title: { text: string };
      author: { name: string };
      duration: { seconds: number };
      thumbnails: Array<{ url: string }>;
    }>;
    has_continuation: boolean;
    getContinuation: () => Promise<MockPage>;
  };

  const pages: MockPage[] = [];
  for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
    const start = pageIndex * 20;
    pages.push({
      results: Array.from({ length: 20 }, (_, itemIndex) => {
        const id = String(start + itemIndex);
        return {
          type: 'Video',
          id,
          title: { text: `Track ${id}` },
          author: { name: 'Artist' },
          duration: { seconds: 180 },
          thumbnails: [{ url: `https://example.invalid/${id}.jpg` }],
        };
      }),
      has_continuation: pageIndex < 4,
      getContinuation: async () => {
        continuationCalls++;
        return pages[pageIndex + 1] as MockPage;
      },
    });
  }

  const clientFactory = async () => ({
    search: async () => {
      initialSearchCalls++;
      return pages[0] as MockPage;
    },
  }) as never;

  const first = await searchMobileYouTubePage('session paging test', 20, 0, undefined, clientFactory);
  const second = await searchMobileYouTubePage('session paging test', 20, 20, undefined, clientFactory);
  const third = await searchMobileYouTubePage('session paging test', 20, 40, undefined, clientFactory);
  const fourth = await searchMobileYouTubePage('session paging test', 20, 60, undefined, clientFactory);

  assert.equal(initialSearchCalls, 1);
  assert.deepEqual(
    [first.results[0]?.id, second.results[0]?.id, third.results[0]?.id, fourth.results[0]?.id],
    ['0', '20', '40', '60'],
  );
  assert.deepEqual(
    [first.results.length, second.results.length, third.results.length, fourth.results.length],
    [20, 20, 20, 20],
  );
  assert.ok(continuationCalls <= 3 * 4);
});

test('mobile YouTube continuation abort rejects promptly', async () => {
  resetYouTubeSearchSessions();
  const controller = new AbortController();
  const initialPage = {
    results: Array.from({ length: 20 }, (_, index) => ({
      type: 'Video',
      id: String(index),
      title: { text: `Track ${index}` },
      author: { name: 'Artist' },
      duration: { seconds: 180 },
      thumbnails: [],
    })),
    has_continuation: true,
    getContinuation: () => new Promise(() => {}),
  };
  const pending = searchMobileYouTubePage(
    'abort paging test',
    20,
    0,
    controller.signal,
    async () => ({ search: async () => initialPage }) as never,
  );
  controller.abort();
  await assert.rejects(pending, /aborted/i);
});
