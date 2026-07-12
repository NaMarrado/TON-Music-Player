import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { useLocation } from 'react-router';
import { Sidebar } from './sidebar';
import { NowPlayingBar } from './now-playing-bar';
import { AppUpdateDialog } from './app-update-dialog';
import { QueuePanel } from '../player/queue-panel';
import { ToastContainer } from '../ui/toast';
import { useMediaSession } from '../../hooks/use-media-session';
import { useKeyboardShortcuts } from '../../hooks/use-keyboard-shortcuts';
import { loadDownloads, subscribeToDownloadEvents } from '../../stores/download-store';
import {
  setSidebarOverlayOpen,
  setSidebarPreference,
  useSidebarInlineCollapsed,
  useSidebarOverlayEnabled,
  useUIStore,
  setQueueOpen,
  setViewportWidth,
  toggleQueue,
} from '../../stores/ui-store';
import {
  DESKTOP_COMPACT_PLAYER_HEIGHT,
  DESKTOP_PLAYER_HEIGHT,
  DESKTOP_SIDEBAR_COLLAPSED_WIDTH,
  DESKTOP_SIDEBAR_EXPANDED_WIDTH,
} from '../../shared/layout';
import { useShellLayout } from './use-shell-layout';

export function MainLayout() {
  useMediaSession();
  useKeyboardShortcuts();
  const location = useLocation();
  const { isCompactPlayer, isSidebarOverlayViewport, viewportWidth } = useShellLayout();
  const sidebarInlineCollapsed = useSidebarInlineCollapsed();
  const sidebarOverlayEnabled = useSidebarOverlayEnabled();
  const sidebarOverlayOpen = useUIStore((s) => s.sidebarOverlayOpen);
  const sidebarPreference = useUIStore((s) => s.sidebarPreference);
  const queueOpen = useUIStore((s) => s.queueOpen);
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarColumnWidth = isSidebarOverlayViewport
    ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
    : sidebarInlineCollapsed
      ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
      : DESKTOP_SIDEBAR_EXPANDED_WIDTH;
  const playerHeight = isCompactPlayer ? DESKTOP_COMPACT_PLAYER_HEIGHT : DESKTOP_PLAYER_HEIGHT;

  useEffect(() => {
    setViewportWidth(viewportWidth);
  }, [viewportWidth]);

  useEffect(() => {
    loadDownloads();
    return subscribeToDownloadEvents();
  }, []);

  useEffect(() => {
    if (!sidebarOverlayEnabled && sidebarOverlayOpen) {
      setSidebarOverlayOpen(false);
    }
  }, [sidebarOverlayEnabled, sidebarOverlayOpen]);

  useEffect(() => {
    if (!sidebarOverlayEnabled || !sidebarOverlayOpen) {
      return;
    }

    setSidebarOverlayOpen(false);
  }, [location.pathname, sidebarOverlayEnabled, sidebarOverlayOpen]);

  useEffect(() => {
    if (!sidebarOverlayEnabled || !sidebarOverlayOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOverlayOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOverlayEnabled, sidebarOverlayOpen]);

  const handleInlineSidebarToggle = () => {
    if (isSidebarOverlayViewport) {
      setSidebarOverlayOpen(true);
      return;
    }

    const nextPreference = sidebarPreference === 'collapsed' ? 'expanded' : 'collapsed';
    const nextWidth = nextPreference === 'collapsed'
      ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
      : DESKTOP_SIDEBAR_EXPANDED_WIDTH;

    shellRef.current?.style.setProperty('grid-template-columns', `${nextWidth}px 1fr`);
    setSidebarPreference(nextPreference);
  };

  const handleOverlaySidebarClose = () => {
    setSidebarOverlayOpen(false);
  };

  return (
    <div
      ref={shellRef}
      className="grid h-screen relative"
      style={{
        gridTemplateColumns: `${sidebarColumnWidth}px 1fr`,
        gridTemplateRows: `1fr ${playerHeight}px`,
      }}
    >
      <Sidebar
        collapsed={isSidebarOverlayViewport ? true : sidebarInlineCollapsed}
        onToggle={handleInlineSidebarToggle}
        toggleIntent={
          isSidebarOverlayViewport
            ? 'expand'
            : sidebarPreference === 'collapsed'
              ? 'expand'
              : 'collapse'
        }
      />
      <div className="flex overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
        <main className="flex-1 overflow-y-auto flex flex-col relative">
          <div
            style={{
              position: 'sticky',
              top: 0,
              left: 0,
              right: 0,
              height: '36px',
              marginBottom: '-36px',
              zIndex: 100,
              WebkitAppRegion: 'drag',
            } as React.CSSProperties}
          />
          <Outlet />
        </main>
        {queueOpen && (
          <QueuePanel onClose={() => setQueueOpen(false)} />
        )}
      </div>
      <NowPlayingBar compact={isCompactPlayer} onQueueToggle={toggleQueue} queueOpen={queueOpen} />
      <ToastContainer />
      <AppUpdateDialog />

      {isSidebarOverlayViewport && sidebarOverlayOpen && (
        <div
          style={{
            position: 'absolute',
            inset: `0 0 ${playerHeight}px 0`,
            zIndex: 240,
          }}
        >
          <button
            aria-label="Close sidebar"
            onClick={handleOverlaySidebarClose}
            style={{
              position: 'absolute',
              inset: 0,
              border: 'none',
              background: 'rgba(0, 0, 0, 0.45)',
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${DESKTOP_SIDEBAR_EXPANDED_WIDTH}px`,
            }}
          >
            <Sidebar
              collapsed={false}
              onToggle={handleOverlaySidebarClose}
              toggleIntent="collapse"
              variant="overlay"
            />
          </div>
        </div>
      )}
    </div>
  );
}
