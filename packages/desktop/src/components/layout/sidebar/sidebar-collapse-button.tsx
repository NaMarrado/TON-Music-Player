export function SidebarCollapseButton({
  collapsed,
  onClick,
  title,
}: {
  collapsed: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center cursor-pointer shrink-0"
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-secondary)',
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
        style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}

