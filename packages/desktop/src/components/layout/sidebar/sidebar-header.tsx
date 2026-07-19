import { SidebarCollapseButton } from './sidebar-collapse-button';
import { SidebarLogo } from './sidebar-logo';

export function SidebarHeader({
  collapsed,
  onToggle,
  toggleTitle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  toggleTitle: string;
}) {
  if (collapsed) {
    return (
      <div
        className="flex justify-center shrink-0"
        style={{
          padding: 'var(--desktop-page-top) 0 16px',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <SidebarCollapseButton collapsed={collapsed} onClick={onToggle} title={toggleTitle} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between shrink-0"
      style={{
        padding: 'var(--desktop-page-top) 20px 16px 24px',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <SidebarLogo collapsed={collapsed} />
      <div
        className="self-start"
        style={{ marginTop: '3px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <SidebarCollapseButton collapsed={collapsed} onClick={onToggle} title={toggleTitle} />
      </div>
    </div>
  );
}
