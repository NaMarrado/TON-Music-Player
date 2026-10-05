import type { CSSProperties } from 'react';

export function getPlaylistTrackGridStyle(showDrag: boolean): CSSProperties {
  return {
    alignItems: 'center',
    columnGap: 'var(--track-grid-gap)',
    display: 'grid',
    gridTemplateColumns: showDrag ? 'var(--playlist-track-columns)' : 'var(--playlist-smart-track-columns)',
    paddingLeft: 'var(--track-grid-inline-padding)',
    paddingRight: 'var(--track-grid-inline-padding)',
  };
}
