import { useEffect, useMemo, useState } from 'react';
import { SectionHeader } from '../helpers';
import type { SettingsLayout } from '../use-settings-layout';
import { loadTracks, useLibraryStore } from '../../../stores/library-store';
import { loadPlaylists, usePlaylistStore } from '../../../stores/playlist-store';
import { PickDialog, type PickItem } from './pick-dialog';
import { ProgressView } from './progress-view';
import { useTransferActions } from './use-transfer-actions';
import './transfer.css';

type Translate = (key: string, opts?: Record<string, unknown>) => string;
type Row = 'profile' | 'library' | 'playlists' | 'songs';
const ROWS: Array<{ id: Row; label: string }> = [
  { id: 'profile', label: 'transferProfile' },
  { id: 'library', label: 'transferLibrary' },
  { id: 'playlists', label: 'transferPlaylists' },
  { id: 'songs', label: 'transferSongs' },
];

type Picker =
  | { mode: 'export-playlists' }
  | { mode: 'export-songs' }
  | { mode: 'import-playlists'; token: string; items: PickItem[] };

function ExportImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function ExportImportSection({ layout, t }: { layout: SettingsLayout; t: Translate }) {
  const tracks = useLibraryStore((state) => state.tracks);
  const hasLibraryLoaded = useLibraryStore((state) => state.hasLoaded);
  const isLibraryLoading = useLibraryStore((state) => state.isLoading);
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const isPlaylistLoading = usePlaylistStore((state) => state.isLoading);
  const { busy, phase, progress, total, runExport, runImport, inspectImport } = useTransferActions(t);
  const [picker, setPicker] = useState<Picker | null>(null);

  useEffect(() => {
    if (!hasLibraryLoaded && !isLibraryLoading) loadTracks().catch(() => {});
    if (!hasPlaylistsLoaded && !isPlaylistLoading) loadPlaylists().catch(() => {});
  }, [hasLibraryLoaded, hasPlaylistsLoaded, isLibraryLoading, isPlaylistLoading]);

  const playlistItems = useMemo<PickItem[]>(() => playlists.map((playlist) => ({ id: playlist.id, label: playlist.name })), [playlists]);
  const songItems = useMemo<PickItem[]>(
    () => tracks.map((track) => ({ id: track.id, label: track.title || '—', detail: track.artist || undefined })),
    [tracks],
  );

  const onExport = async (row: Row) => {
    if (row === 'profile') await runExport({ kind: 'profile' });
    else if (row === 'library') await runExport({ kind: 'library', playlistIds: [] });
    else {
      // The lists are read fresh, so playlists and songs added a moment ago are offered too.
      await (row === 'playlists' ? loadPlaylists({ force: true }) : loadTracks({ force: true }));
      setPicker({ mode: row === 'playlists' ? 'export-playlists' : 'export-songs' });
    }
  };

  const onImport = async (row: Row) => {
    if (row !== 'playlists') {
      await runImport();
      return;
    }
    const inspected = await inspectImport();
    if (!inspected) return;
    setPicker({
      mode: 'import-playlists',
      token: inspected.token,
      items: inspected.playlists.map((playlist) => ({ id: playlist.index, label: playlist.name, detail: String(playlist.trackCount) })),
    });
  };

  const closePicker = () => {
    if (picker?.mode === 'import-playlists') void window.api.invoke('import:discard', picker.token);
    setPicker(null);
  };

  const confirmPicker = (ids: number[]) => {
    const current = picker;
    setPicker(null);
    if (!current) return;
    if (current.mode === 'export-playlists') void runExport({ kind: 'playlist', includeLibrary: false, playlistIds: ids });
    else if (current.mode === 'export-songs') void runExport({ kind: 'songs', includeLibrary: false, playlistIds: [], trackIds: ids });
    else void runImport({ inspectToken: current.token, playlistIndexes: ids });
  };

  const exporting = picker?.mode !== 'import-playlists';
  const pickerItems = picker?.mode === 'import-playlists' ? picker.items : picker?.mode === 'export-songs' ? songItems : playlistItems;

  return (
    <section>
      <SectionHeader compact={layout.compact} icon={<ExportImportIcon />} title={t('transferSection')} />
      <div className="transfer-rows" style={{ paddingLeft: layout.sectionIndent }}>
        {ROWS.map((row) => (
          <div key={row.id} className="transfer-row" data-transfer-row={row.id}>
            <span className="transfer-row-label">{t(row.label)}</span>
            <button type="button" className="transfer-btn" data-primary data-control={`${row.id}-export`} disabled={busy} onClick={() => { void onExport(row.id); }}>
              {t('transferExport')}
            </button>
            <button type="button" className="transfer-btn" data-control={`${row.id}-import`} disabled={busy} onClick={() => { void onImport(row.id); }}>
              {t('transferImport')}
            </button>
          </div>
        ))}
        {busy && <ProgressView phase={phase} progress={progress} total={total} t={t} />}
      </div>
      <PickDialog
        open={picker !== null}
        title={t(picker?.mode === 'export-songs' ? 'transferPickSongs' : 'transferPickPlaylists')}
        items={pickerItems}
        searchPlaceholder={picker?.mode === 'export-songs' ? t('transferSearch') : undefined}
        confirmLabel={t(exporting ? 'transferExport' : 'transferImport')}
        cancelLabel={t('transferCancel')}
        onConfirm={confirmPicker}
        onClose={closePicker}
      />
    </section>
  );
}
