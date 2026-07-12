import { TON_DISCORD_URL } from '@ton/core';
import type { TFunction } from 'i18next';
import { SectionHeader } from './helpers';
import type { SettingsLayout } from './use-settings-layout';

function CommunityIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  );
}

export function CommunityCard({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: TFunction<'pages/settings'>;
}) {
  return (
    <div
      className="settings-card community-card"
      style={{ padding: `${layout.cardPadding}px` }}
    >
      <SectionHeader
        compact={layout.compact}
        icon={<CommunityIcon />}
        title={t('communityTitle')}
        description={t('communityDescription')}
      />
      <div style={{ marginLeft: `${layout.sectionIndent}px` }}>
        <button
          type="button"
          className="community-discord-button cursor-pointer"
          onClick={() => {
            void window.api.invoke('app:open-external', TON_DISCORD_URL);
          }}
        >
          {t('communityButton')}
        </button>
      </div>
    </div>
  );
}
