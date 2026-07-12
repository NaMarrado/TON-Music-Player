import { useLibraryStore } from '../../../stores/library-store';

export function FilterInput({
  compact,
  filterQuery,
  placeholder,
}: {
  compact: boolean;
  filterQuery: string;
  placeholder: string;
}) {
  return (
    <div
      className="relative shrink-0"
      style={{
        width: compact ? '100%' : '220px',
        maxWidth: compact ? 'none' : '100%',
      }}
    >
      <svg
        className="absolute pointer-events-none"
        style={{
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '14px',
          height: '14px',
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
        placeholder={placeholder}
        value={filterQuery}
        onChange={(event) => useLibraryStore.setState({ filterQuery: event.target.value })}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '9px 36px 9px 38px',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '0.85rem',
          transition: 'all var(--transition)',
        }}
      />
      {filterQuery && (
        <button
          className="absolute cursor-pointer"
          onClick={() => useLibraryStore.setState({ filterQuery: '' })}
          style={{
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            padding: '2px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
