import type { SearchResult } from '@ton/core';
import { VirtualizedList } from '../../components/player/virtualized-list';
import { SearchResultRow } from '../search-result-row';

type SearchResultsProps = {
  isSearching: boolean;
  query: string;
  t: (key: string) => string;
  visibleResults: SearchResult[];
  canLoadMore: boolean;
  onDownload: (result: SearchResult) => void;
  onLoadMore: () => void;
  onPlayLocal: (result: SearchResult) => void;
};

function NoResults({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: '48px' }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          width: '32px',
          height: '32px',
          color: 'var(--text-secondary)',
          marginBottom: '12px',
        }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        {t('noResults')}
      </span>
    </div>
  );
}

function LoadingState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-center gap-3" style={{ paddingTop: '48px' }}>
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--text-secondary)',
          animation: 'spin 0.6s linear infinite',
        }}
      />
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        {t('searching')}
      </span>
    </div>
  );
}

export function SearchResults({
  isSearching,
  query,
  t,
  visibleResults,
  canLoadMore,
  onDownload,
  onLoadMore,
  onPlayLocal,
}: SearchResultsProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {query && !isSearching && visibleResults.length === 0 && (
        <div style={{ padding: '20px 32px 120px' }}>
          <NoResults t={t} />
        </div>
      )}

      {isSearching && visibleResults.length === 0 && (
        <div style={{ padding: '20px 32px 120px' }}>
          <LoadingState t={t} />
        </div>
      )}

      {visibleResults.length > 0 && (
        <VirtualizedList
          items={visibleResults}
          estimateSize={62}
          overscan={10}
          keyExtractor={(result, index) =>
            result.source === 'playlist'
              ? `${result.source}-${result.id}-${index}`
              : `${result.source}-${result.id}`
          }
          contentStyle={{ padding: '20px 32px 120px' }}
          footer={
            !isSearching && canLoadMore ? (
              <div className="flex justify-center" style={{ paddingTop: '20px', paddingBottom: '8px' }}>
                <button
                  className="download-btn cursor-pointer"
                  onClick={onLoadMore}
                  style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.82rem',
                    fontFamily: 'inherit',
                    fontWeight: 400,
                    transition: 'all var(--transition)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {t('loadMore')}
                </button>
              </div>
            ) : null
          }
          renderItem={(result) => (
            <SearchResultRow
              result={result}
              t={t}
              onDownload={() => onDownload(result)}
              onDoubleClick={() => {
                if (result.source === 'local' || result.source === 'playlist') {
                  onPlayLocal(result);
                }
              }}
            />
          )}
        />
      )}
    </div>
  );
}
