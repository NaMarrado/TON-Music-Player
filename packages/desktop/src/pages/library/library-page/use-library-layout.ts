import { useDesktopContentWidth } from '../../../hooks/use-desktop-content-width';

export interface LibraryLayout {
  compact: boolean;
  contentPaddingX: number;
  dense: boolean;
  listBottomPadding: number;
  showArtistColumn: boolean;
  showPlaylistColumn: boolean;
}

export function useLibraryLayout(): LibraryLayout {
  const { contentWidth } = useDesktopContentWidth();
  const compact = contentWidth < 920;
  const medium = contentWidth < 1080;
  const dense = contentWidth < 760;

  return {
    compact,
    dense,
    contentPaddingX: compact ? 12 : medium ? 24 : 32,
    listBottomPadding: dense ? 24 : compact ? 36 : 72,
    showArtistColumn: !dense,
    showPlaylistColumn: !compact,
  };
}
