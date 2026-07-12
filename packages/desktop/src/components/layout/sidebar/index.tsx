import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  CreatePlaylistDialog,
  ImportChoiceDialog,
} from '../sidebar-dialogs';
import { PlaylistDropZone } from './playlist-drop-zone';
import { SidebarActions } from './sidebar-actions';
import { SidebarBodyScroll } from './sidebar-body-scroll';
import { SidebarHeader } from './sidebar-header';
import { useSidebarDnd } from './sidebar-dnd';
import { SidebarNav } from './sidebar-nav';
import { useSidebarDragState } from './use-sidebar-drag-state';
import { useSidebarImport } from './use-sidebar-import';

export function Sidebar({
  collapsed,
  onToggle,
  toggleIntent,
  variant = 'inline',
}: {
  collapsed: boolean;
  onToggle: () => void;
  toggleIntent: 'expand' | 'collapse';
  variant?: 'inline' | 'overlay';
}) {
  const { t } = useTranslation('components/layout/sidebar');
  const navigate = useNavigate();
  const {
    duplicateInfo,
    handleCancelImportChoice,
    handleCreatePlaylist,
    handleImportChoice,
    handleImportPlaylist,
    playlists,
    setShowCreateDialog,
    showCreateDialog,
    showImportDialog,
    startImport,
  } = useSidebarImport({ navigate, t });

  const {
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    isDragOver,
  } = useSidebarDragState(startImport);

  const { handlePlaylistDragEnd, playlistIds, sensors } = useSidebarDnd(playlists);

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden relative"
      style={{
        background: 'var(--bg-base)',
        borderRight: '1px solid var(--border-subtle)',
        boxShadow: variant === 'overlay' ? '0 20px 48px rgba(0, 0, 0, 0.45)' : undefined,
      }}
    >
      <SidebarHeader
        collapsed={collapsed}
        onToggle={onToggle}
        toggleTitle={t(toggleIntent)}
      />
      <SidebarBodyScroll collapsed={collapsed}>
        <SidebarNav collapsed={collapsed} t={t} />

        <div
          className="shrink-0"
          style={{ height: '1px', background: 'var(--border)', margin: collapsed ? '4px 8px 16px' : '4px 20px 16px' }}
        />

        <SidebarActions
          collapsed={collapsed}
          onCreatePlaylist={() => setShowCreateDialog(true)}
          onImportPlaylist={() => {
            void handleImportPlaylist();
          }}
          t={t}
        />

        <PlaylistDropZone
          collapsed={collapsed}
          handleDragEnter={handleDragEnter}
          handleDragLeave={handleDragLeave}
          handleDragOver={handleDragOver}
          handleDrop={handleDrop}
          isDragOver={isDragOver}
          onDragEnd={handlePlaylistDragEnd}
          playlistIds={playlistIds}
          playlists={playlists}
          sensors={sensors}
          t={t}
        />
      </SidebarBodyScroll>

      {showCreateDialog && (
        <CreatePlaylistDialog
          t={t}
          onCreate={handleCreatePlaylist}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {showImportDialog && (
        <ImportChoiceDialog
          t={t}
          duplicateInfo={duplicateInfo}
          onChoice={(skipExisting) => {
            void handleImportChoice(skipExisting);
          }}
          onCancel={handleCancelImportChoice}
        />
      )}
    </aside>
  );
}
