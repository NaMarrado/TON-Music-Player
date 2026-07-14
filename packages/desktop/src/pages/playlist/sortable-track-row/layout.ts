import type { CSSProperties } from 'react';

type PlaylistTrackGridOptions = {
  dense: boolean;
  showArtist: boolean;
  showDownloaded: boolean;
  showDrag: boolean;
};

export function getPlaylistTrackGridStyle({
  dense,
  showArtist,
  showDownloaded,
  showDrag,
}: PlaylistTrackGridOptions): CSSProperties {
  const columns: string[] = [];

  if (showDrag) {
    columns.push(dense ? '22px' : '28px');
  }

  columns.push(dense ? '24px' : '32px');
  columns.push('36px');
  columns.push('minmax(0, 1.45fr)');

  if (showArtist) {
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
