import { formatTime } from '@ton/core';
import type { SearchResult } from '@ton/core';
import { isRemoteResult } from './helpers';
import { SearchResultSourceBadge } from './source-badge';

export function SearchResultMeta({
  result,
  t,
}: {
  result: SearchResult;
  t: (key: string) => string;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate"
            style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 400 }}
          >
            {result.title || 'Untitled'}
          </span>
          <SearchResultSourceBadge result={result} />
        </div>
        <div
          className="truncate"
          style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}
        >
          {result.artist || 'Unknown'}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2" style={{ textAlign: 'right' }}>
        {isRemoteResult(result) && result.is_downloaded && (
          <span style={{ fontSize: '0.62rem', color: '#ff4444', fontWeight: 600 }}>
            {t('downloaded')}
          </span>
        )}
        <span
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: '40px',
            textAlign: 'right',
          }}
        >
          {formatTime(result.duration_ms)}
        </span>
      </div>
    </>
  );
}
