export function CancelAllButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="cursor-pointer flex items-center gap-2"
      onClick={onClick}
      style={{
        padding: '7px 16px',
        borderRadius: '20px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.55)',
        color: '#f87171',
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        fontWeight: 500,
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
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
      {label}
    </button>
  );
}
