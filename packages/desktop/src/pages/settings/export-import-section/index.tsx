import { useEffect } from 'react';
import { SectionHeader } from '../helpers';
import { ActionButtons } from './action-buttons';
import { ProgressView } from './progress-view';
import { useExportImportActions } from './use-export-import-actions';
import type { SettingsLayout } from '../use-settings-layout';
import { useExportSummary } from '../../../hooks/use-export-summary';
import { loadTracks, useLibraryStore } from '../../../stores/library-store';
import { loadPlaylists, usePlaylistStore } from '../../../stores/playlist-store';

function ExportImportIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function ExportImportSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const trackCount = useLibraryStore((state) => state.tracks.length);
  const hasLibraryLoaded = useLibraryStore((state) => state.hasLoaded);
  const isLibraryLoading = useLibraryStore((state) => state.isLoading);
  const playlistCount = usePlaylistStore((state) => state.playlists.length);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const isPlaylistLoading = usePlaylistStore((state) => state.isLoading);
  const { canExport, refreshSummary } = useExportSummary(`${trackCount}:${playlistCount}`);

  useEffect(() => {
    if (!hasLibraryLoaded && !isLibraryLoading) {
      loadTracks().catch(() => {});
    }
    if (!hasPlaylistsLoaded && !isPlaylistLoading) {
      loadPlaylists().catch(() => {});
    }
  }, [hasLibraryLoaded, hasPlaylistsLoaded, isLibraryLoading, isPlaylistLoading]);

  const { busy, handleExport, handleImport, phase, progress, statusText, total } =
    useExportImportActions(t, canExport, refreshSummary);

  return (
    <section>
      <SectionHeader compact={layout.compact} icon={<ExportImportIcon />} title={t('exportImportSection')} />
      <div style={{ paddingLeft: layout.sectionIndent }}>
        <ActionButtons
          busy={busy}
          canExport={canExport}
          compact={layout.compact}
          onExport={() => void handleExport()}
          onImport={() => void handleImport()}
          phase={phase}
          t={t}
        />
        {busy && <ProgressView phase={phase} progress={progress} total={total} t={t} />}
        {statusText && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {statusText}
          </div>
        )}
      </div>
    </section>
  );
}
