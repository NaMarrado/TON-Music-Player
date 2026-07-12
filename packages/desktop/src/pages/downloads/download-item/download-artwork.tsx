import type { DownloadItem } from '@ton/core';

function ArtworkFallback() {
  return (
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
  );
}

function ArtworkOverlay({
  isActive,
  isDone,
}: {
  isActive: boolean;
  isDone: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
    >
      {isActive ? (
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.2)',
            borderTopColor: 'var(--white)',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : isDone ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: '18px', height: '18px', color: '#4ade80' }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ width: '16px', height: '16px', color: '#ff4444' }}
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </div>
  );
}

export function DownloadArtwork({
  item,
  showOverlay,
}: {
  item: DownloadItem;
  showOverlay: boolean;
}) {
  const isActive = ['downloading', 'resolving', 'converting'].includes(item.status);
  const isDone = item.status === 'done';

  return (
    <div
      className="shrink-0 rounded overflow-hidden relative"
      style={{ width: '44px', height: '44px' }}
    >
      {item.cover_url ? (
        <img
          src={item.cover_url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <ArtworkFallback />
      )}
      {showOverlay && <ArtworkOverlay isActive={isActive} isDone={isDone} />}
    </div>
  );
}
