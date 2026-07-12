import type { SearchResult } from '@ton/core';

export type SearchResultRowProps = {
  result: SearchResult;
  t: (key: string) => string;
  onDownload: () => void;
  onDoubleClick: () => void;
};
