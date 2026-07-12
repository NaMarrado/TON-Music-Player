import { AppCredit } from '../../app-credit';

export function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return <div style={{ width: '1px', height: '1px' }} aria-hidden />;
  }

  return (
    <div
      className="inline-flex flex-col items-start gap-1"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="logo-text relative inline-block">TON</div>
      <AppCredit compact />
    </div>
  );
}
