import type { Dispatch, MutableRefObject, MouseEvent, SetStateAction } from 'react';
import type { LibraryTrack } from '../../../../stores/library-store';
import type { ContextMenuState } from '../types';

export type LibraryPageActionsArgs = {
  contextMenu: ContextMenuState | null;
  filteredTracksRef: MutableRefObject<LibraryTrack[]>;
  refreshExportSummary: () => Promise<void>;
  selectedIds: Set<number>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  setPlaylistPickerPos: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setSelectedIds: Dispatch<SetStateAction<Set<number>>>;
  t: (key: string, vars?: Record<string, unknown>) => string;
};

export type ContextMenuHandler = (trackId: number, event: MouseEvent) => void;
