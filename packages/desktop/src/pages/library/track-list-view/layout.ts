import type { CSSProperties } from 'react';

type LibraryTrackGridOptions = {
  dense: boolean;
  showArtist: boolean;
  showDownloaded: boolean;
  showPlaylist: boolean;
};

export function getLibraryTrackGridStyle({
  dense,
  showArtist,
  showDownloaded,
  showPlaylist,
}: LibraryTrackGridOptions): CSSProperties {
  const columns: string[] = [
    '36px',
    'minmax(0, 1.45fr)',
  ];

  if (showArtist) {
    columns.push('minmax(0, 1fr)');
  }

  if (showPlaylist) {
    columns.push('minmax(0, 1fr)');
  }

  if (showDownloaded) {
    columns.push('128px');
  }

  columns.push(dense ? '52px' : '50px');
  columns.push('32px');

  return {
    alignItems: 'center',
    columnGap: dense ? '8px' : '12px',
    display: 'grid',
    gridTemplateColumns: columns.join(' '),
    paddingLeft: 'var(--track-grid-inline-padding)',
    paddingRight: 'var(--track-grid-inline-padding)',
  };
}
