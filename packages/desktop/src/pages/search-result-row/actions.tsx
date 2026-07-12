import type { SearchResult } from '@ton/core';
import { isRemoteResult } from './helpers';

type SearchResultActionsProps = {
  result: SearchResult;
  t: (key: string) => string;
  onDownload: () => void;
};

export function SearchResultActions({
  result,
  t,
  onDownload,
}: SearchResultActionsProps) {
  return (
    <div className="shrink-0" style={{ minWidth: '72px', textAlign: 'right' }}>
      {isRemoteResult(result) && (
        <button
          className="download-btn cursor-pointer"
          onClick={(event) => {
            event.stopPropagation();
            onDownload();
          }}
          style={{
            padding: '4px 14px',
            borderRadius: '14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: '0.72rem',
            fontFamily: 'inherit',
            fontWeight: 400,
            transition: 'all var(--transition)',
          }}
        >
          {t('download')}
        </button>
      )}
    </div>
  );
}
