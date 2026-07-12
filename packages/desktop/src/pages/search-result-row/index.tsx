import { SearchResultActions } from './actions';
import { getSearchResultCoverUrl } from './helpers';
import { SearchResultMeta } from './meta';
import { SearchResultThumbnail } from './thumbnail';
import type { SearchResultRowProps } from './types';

export function SearchResultRow({
  result,
  t,
  onDownload,
  onDoubleClick,
}: SearchResultRowProps) {
  const coverUrl = getSearchResultCoverUrl(result);

  return (
    <div
      className="track-row flex items-center gap-3 cursor-pointer"
      onDoubleClick={onDoubleClick}
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        transition: 'background var(--transition)',
      }}
    >
      <SearchResultThumbnail coverUrl={coverUrl} />
      <SearchResultMeta result={result} t={t} />
      <SearchResultActions result={result} t={t} onDownload={onDownload} />
    </div>
  );
}
