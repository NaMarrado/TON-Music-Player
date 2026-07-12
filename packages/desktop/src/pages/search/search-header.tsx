import type { SearchSource } from '@ton/core';
import { SOURCE_TABS } from './constants';

type SearchHeaderProps = {
  activeSource: SearchSource | 'all';
  counts: Record<string, number>;
  isSearching: boolean;
  query: string;
  t: (key: string) => string;
  onSetActiveSource: (source: SearchSource | 'all') => void;
  onSetSearchQuery: (query: string) => void;
};

export function SearchHeader({
  activeSource,
  counts,
  isSearching,
  query,
  t,
  onSetActiveSource,
  onSetSearchQuery,
}: SearchHeaderProps) {
  return (
    <div
      className="flex flex-col items-center shrink-0 sticky top-0 z-10"
      style={{
        padding: '44px 32px 16px',
        background: 'linear-gradient(var(--bg-deep) 60%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="relative w-full" style={{ maxWidth: '560px' }}>
        <svg
          className="absolute pointer-events-none"
          style={{
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '16px',
            height: '16px',
            color: 'var(--text-secondary)',
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16" y2="16" />
        </svg>
        <input
          type="text"
          className="w-full outline-none search-input"
          placeholder={t('placeholder')}
          value={query}
          onChange={(event) => onSetSearchQuery(event.target.value)}
          autoFocus
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '24px',
            padding: '12px 20px 12px 44px',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '0.93rem',
            transition: 'all var(--transition)',
          }}
        />
      </div>

      {query && (
        <div className="flex items-center gap-1.5" style={{ marginTop: '16px' }}>
          {SOURCE_TABS.map((tab) => {
            const isActive = activeSource === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                className="search-tab cursor-pointer"
                onClick={() => onSetActiveSource(tab.key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  background: isActive ? 'var(--white)' : 'transparent',
                  border: 'none',
                  color: isActive ? 'var(--bg-deep)' : 'var(--text-secondary)',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: 'inherit',
                  transition: 'all var(--transition)',
                  letterSpacing: '0.01em',
                }}
              >
                {t(tab.labelKey)}
                {count > 0 && (
                  <span
                    style={{
                      marginLeft: '6px',
                      opacity: isActive ? 0.5 : 0.6,
                      fontSize: '0.72rem',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {isSearching && (
            <div
              className="ml-2"
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: '2px solid var(--border)',
                borderTopColor: 'var(--text-secondary)',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
