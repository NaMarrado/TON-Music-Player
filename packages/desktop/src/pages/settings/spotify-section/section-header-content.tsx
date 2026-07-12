import { SectionHeader } from '../helpers';
import type { SpotifyTranslator } from './use-spotify-credentials';

interface SpotifySectionHeaderProps {
  compact: boolean;
  hasCredentials: boolean;
  onOpenHelp: () => void;
  t: SpotifyTranslator;
}

function SpotifyIcon() {
  return (
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
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
      <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
      <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
      <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
    </svg>
  );
}

export function SpotifySectionHeader({
  compact,
  hasCredentials,
  onOpenHelp,
  t,
}: SpotifySectionHeaderProps) {
  return (
    <SectionHeader
      compact={compact}
      icon={<SpotifyIcon />}
      title={
        <span className="flex items-center gap-2">
          {t('spotify')}
          <button
            className="download-btn cursor-pointer flex items-center justify-center"
            onClick={onOpenHelp}
            title={t('spotifyHelpTitle')}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--white)',
              fontSize: '0.7rem',
              fontWeight: 600,
              fontFamily: 'inherit',
              padding: 0,
              transition: 'all var(--transition)',
            }}
          >
            ?
          </button>
        </span>
      }
      description={t('spotifyDescription')}
      right={
        <div className="flex items-center gap-2">
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: hasCredentials ? '#1db954' : 'var(--text-secondary)',
              transition: 'background var(--transition)',
            }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {hasCredentials ? t('spotifyConnected') : t('spotifyNotConnected')}
          </span>
        </div>
      }
    />
  );
}
