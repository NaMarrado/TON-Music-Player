import { SectionHeader } from '../helpers';
import { ActionButtons } from '../export-import-section/action-buttons';
import type { SettingsLayout } from '../use-settings-layout';
import { useProfileActions } from './use-profile-actions';

function ProfileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

/** Saves everything that makes the app yours (settings, stars, playlists, listening history) in one small file, and restores it. */
export function ProfileExportSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const { busy, handleExport, handleImport, statusText } = useProfileActions(t);

  return (
    <section data-section="profile-export">
      <SectionHeader compact={layout.compact} icon={<ProfileIcon />} title={t('profileExportSection')} />
      <div style={{ paddingLeft: layout.sectionIndent }}>
        <p style={{ margin: '0 0 12px', maxWidth: '560px', fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {t('profileExportDescription')}
        </p>
        <ActionButtons
          busy={busy !== ''}
          canExport
          compact={layout.compact}
          onExport={() => void handleExport()}
          onImport={() => void handleImport()}
          phase={busy}
          t={t}
          control="profile"
          labels={{
            export: t('profileExportButton'),
            exporting: t('profileExporting'),
            import: t('profileImportButton'),
            importing: t('profileImporting'),
          }}
        />
        {statusText && (
          <div role="status" data-profile-status style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {statusText}
          </div>
        )}
      </div>
    </section>
  );
}
