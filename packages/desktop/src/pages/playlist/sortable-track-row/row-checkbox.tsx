export function RowCheckbox({
  isSelected,
  onToggle,
}: {
  isSelected: boolean;
  onToggle: (shiftKey: boolean) => void;
}) {
  return (
    <div
      className="shrink-0 flex items-center justify-center"
      style={{ width: '100%' }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event.shiftKey);
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '3px',
          border: `1.5px solid ${isSelected ? 'var(--white)' : 'var(--text-secondary)'}`,
          background: isSelected ? 'var(--white)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all var(--transition)',
          cursor: 'pointer',
        }}
      >
        {isSelected && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--bg-deep)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    </div>
  );
}
