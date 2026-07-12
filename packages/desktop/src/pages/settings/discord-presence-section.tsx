import { SectionHeader, ToggleSwitch } from './helpers';
import type { SettingsLayout } from './use-settings-layout';
import {
  setDiscordPresenceEnabled,
  useDiscordPresenceStore,
} from '../../services/discord-presence';

export function DiscordPresenceSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string) => string;
}) {
  const enabled = useDiscordPresenceStore((state) => state.enabled);
  const loaded = useDiscordPresenceStore((state) => state.loaded);

  return (
    <section>
      <SectionHeader
        compact={layout.compact}
        icon={(
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M19.5 5.34A16.3 16.3 0 0 0 15.44 4l-.5 1.02a15.1 15.1 0 0 0-5.88 0L8.55 4A16.5 16.5 0 0 0 4.5 5.35C1.94 9.14 1.25 12.84 1.6 16.5a16.7 16.7 0 0 0 4.98 2.5l1.2-1.64a10.7 10.7 0 0 1-1.88-.9l.46-.36c3.63 1.68 7.57 1.68 11.16 0l.47.36c-.6.36-1.23.66-1.89.9L17.3 19a16.6 16.6 0 0 0 4.98-2.5c.42-4.24-.72-7.9-2.78-11.16ZM8.83 14.27c-1.09 0-1.98-1-1.98-2.22 0-1.23.87-2.23 1.98-2.23 1.1 0 2 1.01 1.98 2.23 0 1.22-.88 2.22-1.98 2.22Zm6.34 0c-1.09 0-1.98-1-1.98-2.22 0-1.23.87-2.23 1.98-2.23 1.1 0 2 1.01 1.98 2.23 0 1.22-.87 2.22-1.98 2.22Z" />
          </svg>
        )}
        title={t('discordPresenceSection')}
        description={t('discordPresenceDescription')}
        right={(
          <ToggleSwitch
            enabled={enabled}
            disabled={!loaded}
            onClick={() => void setDiscordPresenceEnabled(!enabled)}
          />
        )}
      />
      <p
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.72rem',
          lineHeight: 1.5,
          margin: 0,
          paddingLeft: layout.compact ? 0 : '40px',
        }}
      >
        {t('discordPresenceRequirement')}
      </p>
    </section>
  );
}
