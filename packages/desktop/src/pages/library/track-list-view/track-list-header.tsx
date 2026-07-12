import { useCallback } from 'react';
import { LibraryTrackGridShell, getLibraryTrackGridStyle } from './grid-shell';
import { useLibraryStore } from '../../../stores/library-store';
import { SelectionCheckbox } from './selection-checkbox';
import { SortArrow } from './sort-arrow';
import type { SortField } from './types';

type TrackListHeaderProps = {
  allSelected: boolean;
  dense: boolean;
  onSelectAll: () => void;
  showArtist: boolean;
  showPlaylist: boolean;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  t: (key: string) => string;
};

export function TrackListHeader({
  allSelected,
  dense,
  onSelectAll,
  showArtist,
  showPlaylist,
  sortBy,
  sortOrder,
  t,
}: TrackListHeaderProps) {
  const handleSort = useCallback((field: SortField) => {
    const current = useLibraryStore.getState();
    if (current.sortBy === field) {
      useLibraryStore.setState({ sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      useLibraryStore.setState({ sortBy: field, sortOrder: 'asc' });
    }
  }, []);
  const textHeaderCellStyle = {
    display: 'flex',
    justifyContent: 'flex-start',
    textAlign: 'left',
    width: '100%',
  } as const;

  return (
    <div
      style={{
        ...getLibraryTrackGridStyle({ dense, showArtist, showPlaylist }),
        paddingRight: 'calc(var(--track-grid-inline-padding) + var(--desktop-scrollbar-width))',
        paddingBottom: 'var(--track-list-header-padding-bottom)',
        marginBottom: 'var(--track-list-row-gap)',
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <LibraryTrackGridShell
        showArtist={showArtist}
        showPlaylist={showPlaylist}
        coverSlot={null}
        titleSlot={
          <div style={textHeaderCellStyle}>
            <span className="inline-flex items-center cursor-pointer" onClick={() => handleSort('title')}>
              {t('colTitle')}
              <SortArrow active={sortBy === 'title'} ascending={sortOrder === 'asc'} />
            </span>
          </div>
        }
        artistSlot={showArtist ? (
          <div style={textHeaderCellStyle}>
            <span className="inline-flex items-center cursor-pointer" onClick={() => handleSort('artist')}>
              {t('colArtist')}
              <SortArrow active={sortBy === 'artist'} ascending={sortOrder === 'asc'} />
            </span>
          </div>
        ) : undefined}
        playlistSlot={showPlaylist ? (
          <div style={textHeaderCellStyle}>
            <span className="inline-flex items-center cursor-pointer" onClick={() => handleSort('playlist')}>
              {t('colPlaylist')}
              <SortArrow active={sortBy === 'playlist'} ascending={sortOrder === 'asc'} />
            </span>
          </div>
        ) : undefined}
        timeSlot={
          <span className="cursor-pointer" onClick={() => handleSort('duration_ms')}>
            {t('colDuration')}
            <SortArrow active={sortBy === 'duration_ms'} ascending={sortOrder === 'asc'} />
          </span>
        }
        checkboxSlot={<SelectionCheckbox checked={allSelected} onClick={() => onSelectAll()} />}
      />
    </div>
  );
}
