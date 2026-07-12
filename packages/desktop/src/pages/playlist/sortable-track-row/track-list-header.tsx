import { SortArrow } from './sort-arrow';
import { PlaylistTrackGridShell, getPlaylistTrackGridStyle } from './grid-shell';
import type { SortColumn, SortDir } from './types';

type TrackListHeaderProps = {
  allSelected: boolean;
  dense: boolean;
  onSelectAll: () => void;
  onSort: (col: SortColumn) => void;
  showArtist: boolean;
  showDrag: boolean;
  sortBy: SortColumn;
  sortDir: SortDir;
  t: (key: string) => string;
};

export function TrackListHeader({
  allSelected,
  dense,
  onSelectAll,
  onSort,
  showArtist,
  showDrag,
  sortBy,
  sortDir,
  t,
}: TrackListHeaderProps) {
  const headerStyle = { cursor: 'pointer', userSelect: 'none' as const };
  const textHeaderCellStyle = {
    display: 'flex',
    justifyContent: 'flex-start',
    textAlign: 'left',
    width: '100%',
  } as const;

  return (
    <div
      style={{
        ...getPlaylistTrackGridStyle({ dense, showArtist, showDrag }),
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
      <PlaylistTrackGridShell
        showArtist={showArtist}
        showDrag={showDrag}
        dragSlot={null}
        indexSlot={
          <span
            onClick={() => onSort('#')}
            style={{ ...headerStyle, padding: 0, borderRadius: '3px', lineHeight: 1 }}
          >
            #
          </span>
        }
        coverSlot={null}
        titleSlot={
          <div style={textHeaderCellStyle}>
            <span
              onClick={() => onSort('title')}
              className="inline-flex items-center"
              style={{ ...headerStyle, borderRadius: '3px' }}
            >
              {t('colTitle')}
              <SortArrow dir={sortBy === 'title' ? sortDir : null} />
            </span>
          </div>
        }
        artistSlot={showArtist ? (
          <div style={textHeaderCellStyle}>
            <span
              onClick={() => onSort('artist')}
              className="inline-flex items-center"
              style={{ ...headerStyle, borderRadius: '3px' }}
            >
              {t('colArtist')}
              <SortArrow dir={sortBy === 'artist' ? sortDir : null} />
            </span>
          </div>
        ) : undefined}
        timeSlot={
          <span
            onClick={() => onSort('time')}
            style={{
              ...headerStyle,
              borderRadius: '3px',
            }}
          >
            {t('colTime')}
          </span>
        }
        checkboxSlot={
          <div
            className="flex items-center justify-center cursor-pointer"
            onClick={onSelectAll}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '3px',
                border: `1.5px solid ${allSelected ? 'var(--white)' : 'var(--text-secondary)'}`,
                background: allSelected ? 'var(--white)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition)',
              }}
            >
              {allSelected && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--bg-deep)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
