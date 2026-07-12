import type { SearchResult } from '@ton/core';
import { SOURCE_COLORS } from '../search-result-source-colors';
import { getSearchResultSourceLabel } from './helpers';

export function SearchResultSourceBadge({ result }: { result: SearchResult }) {
  return (
    <span
      className="shrink-0"
      style={{
        padding: '1px 5px',
        borderRadius: '3px',
        fontSize: '0.58rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: result.source === 'playlist' ? 'none' : 'uppercase',
        background: `${SOURCE_COLORS[result.source]}18`,
        color: SOURCE_COLORS[result.source],
      }}
    >
      {getSearchResultSourceLabel(result)}
    </span>
  );
}
