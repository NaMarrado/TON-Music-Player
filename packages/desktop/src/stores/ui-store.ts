import { create } from 'zustand';
import { DESKTOP_SIDEBAR_AUTO_COLLAPSE_WIDTH } from '../shared/layout';

type SidebarPreference = 'expanded' | 'collapsed';

interface UIState {
  sidebarOverlayOpen: boolean;
  sidebarPreference: SidebarPreference;
  viewportWidth: number;
  queueOpen: boolean;
  eqPreset: string;
  eqEnabled: boolean;
}

const savedQueue = localStorage.getItem('ui:queueOpen');
const savedSidebarCollapsed = localStorage.getItem('ui:sidebarCollapsed');
const savedSidebarPreference = localStorage.getItem('ui:sidebarPreference');
let sidebarPersistenceTimer: number | undefined;

function getInitialSidebarPreference(): SidebarPreference {
  if (savedSidebarPreference === 'expanded' || savedSidebarPreference === 'collapsed') {
    return savedSidebarPreference;
  }

  return savedSidebarCollapsed === 'true' ? 'collapsed' : 'expanded';
}

export const useUIStore = create<UIState>()(() => ({
  sidebarOverlayOpen: false,
  sidebarPreference: getInitialSidebarPreference(),
  viewportWidth: window.innerWidth,
  queueOpen: savedQueue === 'true',
  eqPreset: 'flat',
  eqEnabled: false,
}));

function isAutoCollapsed(viewportWidth: number): boolean {
  return viewportWidth < DESKTOP_SIDEBAR_AUTO_COLLAPSE_WIDTH;
}

export function setQueueOpen(open: boolean): void {
  useUIStore.setState({ queueOpen: open });
  localStorage.setItem('ui:queueOpen', String(open));
}

export function toggleQueue(): void {
  const next = !useUIStore.getState().queueOpen;
  setQueueOpen(next);
}

export function setSidebarPreference(nextPreference: SidebarPreference): void {
  useUIStore.setState({ sidebarPreference: nextPreference });

  window.clearTimeout(sidebarPersistenceTimer);
  sidebarPersistenceTimer = window.setTimeout(() => {
    localStorage.setItem('ui:sidebarPreference', nextPreference);
    localStorage.setItem('ui:sidebarCollapsed', String(nextPreference === 'collapsed'));
  }, 0);
}

export function toggleSidebarPreference(): void {
  const next = useUIStore.getState().sidebarPreference === 'collapsed'
    ? 'expanded'
    : 'collapsed';
  setSidebarPreference(next);
}

export function setSidebarOverlayOpen(open: boolean): void {
  useUIStore.setState({ sidebarOverlayOpen: open });
}

export function toggleSidebarOverlay(): void {
  const next = !useUIStore.getState().sidebarOverlayOpen;
  setSidebarOverlayOpen(next);
}

export function setViewportWidth(width: number): void {
  useUIStore.setState({ viewportWidth: width });
}

export function useSidebarInlineCollapsed(): boolean {
  return useUIStore((state) => (
    isAutoCollapsed(state.viewportWidth) || state.sidebarPreference === 'collapsed'
  ));
}

export function useSidebarOverlayEnabled(): boolean {
  return useUIStore((state) => isAutoCollapsed(state.viewportWidth));
}
