import { useDesktopViewport } from '../../hooks/use-desktop-viewport';
import { DESKTOP_SIDEBAR_AUTO_COLLAPSE_WIDTH } from '../../shared/layout';

const DESKTOP_COMPACT_PLAYER_WIDTH = 920;

export function useShellLayout() {
  const { width } = useDesktopViewport();

  return {
    viewportWidth: width,
    isCompactPlayer: width < DESKTOP_COMPACT_PLAYER_WIDTH,
    isSidebarOverlayViewport: width < DESKTOP_SIDEBAR_AUTO_COLLAPSE_WIDTH,
  };
}
