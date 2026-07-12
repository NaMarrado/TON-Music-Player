import { useDesktopContentWidth } from '../../../hooks/use-desktop-content-width';

export interface PlaylistLayout {
  compact: boolean;
  contentPaddingX: number;
  coverSize: number;
  dense: boolean;
  showArtistColumn: boolean;
}

export function usePlaylistLayout(): PlaylistLayout {
  const { contentWidth } = useDesktopContentWidth();
  const compact = contentWidth < 920;
  const medium = contentWidth < 1080;
  const dense = contentWidth < 760;

  return {
    compact,
    dense,
    contentPaddingX: compact ? 12 : medium ? 24 : 32,
    coverSize: compact ? 84 : 180,
    showArtistColumn: !dense,
  };
}
