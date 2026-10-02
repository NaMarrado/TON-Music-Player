import type { CSSProperties } from 'react';

export const libraryTrackGridStyle: CSSProperties = {
  alignItems: 'center',
  columnGap: 'var(--track-grid-gap)',
  display: 'grid',
  gridTemplateColumns: 'var(--library-track-columns)',
  paddingLeft: 'var(--track-grid-inline-padding)',
  paddingRight: 'var(--track-grid-inline-padding)',
};
