import { CredentialsForm } from './credentials-form';
import { SpotifySectionHeader } from './section-header-content';
import { SpotifyHelpDialog } from './spotify-help-dialog';
import { useSpotifyCredentials, type SpotifyTranslator } from './use-spotify-credentials';
import type { SettingsLayout } from '../use-settings-layout';

export function SpotifySection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: SpotifyTranslator;
}) {
  const {
    handleSave,
    hasCredentials,
    id,
    saved,
    secret,
    setId,
    setSecret,
    setShowHelp,
    showHelp,
  } = useSpotifyCredentials();

  return (
    <section>
      <SpotifySectionHeader
        compact={layout.compact}
        hasCredentials={hasCredentials}
        onOpenHelp={() => setShowHelp(true)}
        t={t}
      />
      <CredentialsForm
        id={id}
        layout={layout}
        onSave={handleSave}
        saved={saved}
        secret={secret}
        setId={setId}
        setSecret={setSecret}
        t={t}
      />
      {showHelp && <SpotifyHelpDialog t={t} onClose={() => setShowHelp(false)} />}
    </section>
  );
}
