import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaylistImportDialog } from '../../pages/downloads/spotify-import-dialog';

export function ImportPlaylistButton({
  compact = false,
  fillWidth,
}: {
  compact?: boolean;
  fillWidth?: boolean;
}) {
  const { t } = useTranslation('pages/downloads');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="download-btn cursor-pointer flex items-center gap-2"
        onClick={() => setOpen(true)}
        style={{
          padding: compact ? '8px 12px' : '7px 16px',
          borderRadius: compact ? '14px' : '20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          fontWeight: 400,
          transition: 'all var(--transition)',
          letterSpacing: '0.01em',
          justifyContent: 'center',
          minHeight: compact ? '38px' : undefined,
          width: fillWidth === undefined ? (compact ? '100%' : undefined) : fillWidth ? '100%' : undefined,
          whiteSpace: 'nowrap',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        {t('importPlaylist')}
      </button>
      {open && (
        <PlaylistImportDialog t={t} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
