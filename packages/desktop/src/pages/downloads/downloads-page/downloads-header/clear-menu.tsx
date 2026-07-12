type ClearAction = {
  label: 'clearAll' | 'clearCompleted' | 'clearFailed';
  color?: string;
  action: () => Promise<void>;
};

function ClearMenuItem({
  color,
  label,
  onClick,
}: {
  color?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full cursor-pointer clear-menu-item"
      onClick={onClick}
      style={{
        display: 'block',
        padding: '8px 12px',
        borderRadius: '6px',
        background: 'transparent',
        border: 'none',
        color: color || 'var(--text-primary)',
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background var(--transition)',
      }}
    >
      {label}
    </button>
  );
}

export function ClearMenu({
  clearActions,
  clearMenuRef,
  onClearAction,
  onToggleClearMenu,
  showClearMenu,
  t,
}: {
  clearActions: ReadonlyArray<ClearAction>;
  clearMenuRef: React.RefObject<HTMLDivElement | null>;
  onClearAction: (action: () => Promise<void>) => void;
  onToggleClearMenu: () => void;
  showClearMenu: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="relative" ref={clearMenuRef}>
      <button
        className="download-btn cursor-pointer"
        onClick={onToggleClearMenu}
        style={{
          padding: '7px 16px',
          borderRadius: '20px',
          background: showClearMenu ? 'var(--bg-elevated)' : 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          fontWeight: 400,
          transition: 'all var(--transition)',
          letterSpacing: '0.01em',
        }}
      >
        {t('clear')}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            width: '12px',
            height: '12px',
            marginLeft: '6px',
            display: 'inline-block',
            verticalAlign: 'middle',
            transition: 'transform var(--transition)',
            transform: showClearMenu ? 'rotate(180deg)' : 'rotate(0)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showClearMenu && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '4px',
            minWidth: '160px',
            zIndex: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {clearActions.map((action) => (
            <ClearMenuItem
              key={action.label}
              label={t(action.label)}
              color={action.color}
              onClick={() => onClearAction(action.action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
