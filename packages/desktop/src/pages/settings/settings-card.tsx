import type { ReactNode } from 'react';
import type { SettingsLayout } from './use-settings-layout';

export function SettingsCard({
  children,
  layout,
  attention = false,
}: {
  children: ReactNode;
  layout: SettingsLayout;
  attention?: boolean;
}) {
  return (
    <div
      className={`settings-card${attention ? ' settings-card-attention' : ''}`}
      style={{ padding: `${layout.cardPadding}px` }}
    >
      {children}
    </div>
  );
}
