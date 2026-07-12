import { useUIStore, useSidebarInlineCollapsed, useSidebarOverlayEnabled } from '../stores/ui-store';
import { useDesktopViewport } from './use-desktop-viewport';
import {
  DESKTOP_QUEUE_PANEL_WIDTH,
  DESKTOP_SIDEBAR_COLLAPSED_WIDTH,
  DESKTOP_SIDEBAR_EXPANDED_WIDTH,
} from '../shared/layout';

export function useDesktopContentWidth() {
  const { width } = useDesktopViewport();
  const queueOpen = useUIStore((state) => state.queueOpen);
  const sidebarInlineCollapsed = useSidebarInlineCollapsed();
  const sidebarOverlayEnabled = useSidebarOverlayEnabled();

  const sidebarWidth = sidebarOverlayEnabled
    ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
    : sidebarInlineCollapsed
      ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
      : DESKTOP_SIDEBAR_EXPANDED_WIDTH;
  const queueWidth = queueOpen ? DESKTOP_QUEUE_PANEL_WIDTH : 0;

  return {
    viewportWidth: width,
    contentWidth: Math.max(0, width - sidebarWidth - queueWidth),
  };
}
