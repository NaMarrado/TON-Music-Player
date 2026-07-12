type CoverPickerProps = {
  coverUrl: string | null;
  t: (key: string) => string;
  onPickCover: () => void;
};

export function CoverPicker({ coverUrl, t, onPickCover }: CoverPickerProps) {
  return (
    <div className="flex flex-col items-center" style={{ marginBottom: '20px' }}>
      <button
        className="cursor-pointer rounded-[var(--radius-lg)] overflow-hidden flex items-center justify-center"
        onClick={onPickCover}
        style={{
          width: '120px',
          height: '120px',
          background: 'linear-gradient(135deg, #111, #1e1e1e)',
          border: '2px dashed var(--border)',
          padding: 0,
          transition: 'border-color var(--transition)',
        }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {t('changeCover')}
            </span>
          </div>
        )}
      </button>
      {coverUrl && (
        <button
          className="cursor-pointer"
          onClick={onPickCover}
          style={{
            marginTop: '8px',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontFamily: 'inherit',
          }}
        >
          {t('changeCover')}
        </button>
      )}
    </div>
  );
}
