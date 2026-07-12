import type { ReactNode } from 'react';

export function SidebarBodyScroll({
  children,
}: {
  children: ReactNode;
  collapsed: boolean;
}) {
  return (
    <div
      className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ paddingBottom: '16px' }}
    >
      {children}
    </div>
  );
}
