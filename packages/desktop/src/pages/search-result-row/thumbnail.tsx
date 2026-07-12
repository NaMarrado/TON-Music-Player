export function SearchResultThumbnail({ coverUrl }: { coverUrl: string | null }) {
  return (
    <div className="shrink-0 rounded overflow-hidden" style={{ width: '44px', height: '44px' }}>
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      )}
    </div>
  );
}
