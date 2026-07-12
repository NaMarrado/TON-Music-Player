import { SOURCE_COLORS } from './constants';

export function DownloadSourceBadge({ source }: { source?: string | null }) {
  if (!source || !SOURCE_COLORS[source]) {
    return null;
  }

  return (
    <span
      className="shrink-0"
      style={{
        padding: '1px 5px',
        borderRadius: '3px',
        fontSize: '0.58rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        background: `${SOURCE_COLORS[source]}18`,
        color: SOURCE_COLORS[source],
      }}
    >
      {source === 'youtube' ? 'YT' : source === 'spotify' ? 'SP' : 'SC'}
    </span>
  );
}
