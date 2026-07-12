import { SOURCE_COLORS } from '../../search-result-source-colors';
import { ErrorBanner } from './error-banner';
import { resolveSearchErrorBanner } from './resolve-search-error';

type ErrorBannersProps = {
  dismissed: Record<string, boolean>;
  query: string;
  sourceErrors: Record<string, string>;
  t: (key: string) => string;
  onDismissBanner: (source: string) => void;
  onOpenSettings: () => void;
};

export function ErrorBanners({
  dismissed,
  query,
  sourceErrors,
  t,
  onDismissBanner,
  onOpenSettings,
}: ErrorBannersProps) {
  if (!query || !Object.keys(sourceErrors).some((key) => !dismissed[key])) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-2"
      style={{ padding: '16px 32px 0', maxWidth: '560px', margin: '0 auto', width: '100%' }}
    >
      {(['spotify', 'youtube', 'soundcloud'] as const).map((source) => {
        const errorMessage = sourceErrors[source];
        if (!errorMessage || dismissed[source]) {
          return null;
        }

        const banner = resolveSearchErrorBanner(source, errorMessage, t);
        return (
          <ErrorBanner
            key={source}
            color={SOURCE_COLORS[source]}
            label={source === 'youtube' ? 'YouTube' : source === 'spotify' ? 'Spotify' : 'SoundCloud'}
            message={banner.message}
            openSettingsLabel={banner.showSettings ? t('openSettings') : undefined}
            onDismiss={() => onDismissBanner(source)}
            onOpenSettings={banner.showSettings ? onOpenSettings : undefined}
          />
        );
      })}
    </div>
  );
}
