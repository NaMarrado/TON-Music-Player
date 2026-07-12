const NAMARRADO_URL = 'https://linktr.ee/namarrado';

export function AppCredit({
  align = 'left',
  compact = false,
}: {
  align?: 'left' | 'center';
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void window.api.invoke('app:open-external', NAMARRADO_URL);
      }}
      style={{
        WebkitAppRegion: 'no-drag',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        textAlign: align,
        color: 'var(--text-secondary)',
        fontSize: compact ? '0.72rem' : '0.82rem',
        lineHeight: compact ? 1.2 : 1.35,
      } as React.CSSProperties}
    >
      by NaMarrado
    </button>
  );
}
