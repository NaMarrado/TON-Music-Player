import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Playlist } from '@ton/core';
import { SectionLabel } from '../../ui/section-label';
import { SortablePlaylistItem } from './sortable-playlist-item';

type PlaylistDropZoneProps = {
  collapsed: boolean;
  handleDragEnter: (event: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => Promise<void>;
  isDragOver: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  playlistIds: string[];
  playlists: Playlist[];
  sensors: SensorDescriptor<SensorOptions>[];
  t: (key: string) => string;
};

export function PlaylistDropZone({
  collapsed,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  isDragOver,
  onDragEnd,
  playlistIds,
  playlists,
  sensors,
  t,
}: PlaylistDropZoneProps) {
  return (
    <div
      className="relative"
      style={{
        padding: collapsed ? '0 8px' : '0 12px',
        outline: isDragOver ? '2px dashed var(--white)' : 'none',
        outlineOffset: '-4px',
        borderRadius: '8px',
        transition: 'outline-color 0.15s',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(event) => {
        void handleDrop(event);
      }}
    >
      {!collapsed && (
        <div style={{ padding: '4px 12px 10px' }}>
          <SectionLabel>{t('yourPlaylists')}</SectionLabel>
        </div>
      )}

      {isDragOver && (
        <div
          className="flex items-center justify-center"
          style={{
            padding: collapsed ? '12px 8px' : '20px 12px',
            margin: '0 0 8px',
            borderRadius: '8px',
            background: 'var(--glow-strong)',
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
            textAlign: 'center',
          }}
        >
          {collapsed ? '…' : t('dropFolder')}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={playlistIds} strategy={verticalListSortingStrategy}>
          {playlists.map((playlist) => (
            <SortablePlaylistItem key={playlist.id} collapsed={collapsed} playlist={playlist} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
