import type { ReactNode } from 'react';
import type { SettingsLayout } from './use-settings-layout';

export function SettingsCard({
  children,
  layout,
}: {
  children: ReactNode;
  layout: SettingsLayout;
}) {
  return (
    <div className="settings-card" style={{ padding: `${layout.cardPadding}px` }}>
      {children}
    </div>
  );
}

