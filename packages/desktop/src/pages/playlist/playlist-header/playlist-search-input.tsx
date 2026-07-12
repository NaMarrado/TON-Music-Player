export function PlaylistSearchInput({
  compact,
  filterQuery,
  placeholder,
  onFilterChange,
}: {
  compact: boolean;
  filterQuery: string;
  placeholder: string;
  onFilterChange: (query: string) => void;
}) {
  return (
    <div
      className="relative flex items-center"
      style={{ width: compact ? '100%' : undefined, maxWidth: compact ? 'none' : '220px' }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute"
        style={{ left: '10px', color: 'var(--text-secondary)', pointerEvents: 'none' }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={filterQuery}
        onChange={(event) => onFilterChange(event.target.value)}
        placeholder={placeholder}
        style={{
          width: compact ? '100%' : filterQuery ? '180px' : '140px',
          minWidth: compact ? '100%' : undefined,
          padding: compact ? '10px 12px 10px 30px' : '7px 12px 7px 30px',
          borderRadius: compact ? '16px' : '20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          outline: 'none',
          transition: 'all var(--transition)',
        }}
      />
    </div>
  );
}
