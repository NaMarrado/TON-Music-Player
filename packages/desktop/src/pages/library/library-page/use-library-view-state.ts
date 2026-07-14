import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { formatTrackFileSizeSummary, summarizeTrackFileSizes } from '@ton/core';
import {
  getFilteredTracks,
  reconcileLibraryTracks,
} from '../../../stores/library-store';
import type { LibraryTrack, SortField } from '../../../stores/library-store';
import type { ContextMenuState } from './types';

export function useLibraryViewState(
  tracks: LibraryTrack[],
  filterQuery: string,
  sortBy: SortField,
  sortOrder: 'asc' | 'desc',
) {
  const filteredTracks = useMemo(
    () => getFilteredTracks(tracks, filterQuery, sortBy, sortOrder),
    [tracks, filterQuery, sortBy, sortOrder],
  );
  const filteredTracksRef = useRef(filteredTracks);
  filteredTracksRef.current = filteredTracks;

  const totalDuration = useMemo(
    () => filteredTracks.reduce((sum, track) => sum + (track.duration_ms || 0), 0),
    [filteredTracks],
  );
  const totalSizeLabel = useMemo(
    () => formatTrackFileSizeSummary(summarizeTrackFileSizes(filteredTracks)),
    [filteredTracks],
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [playlistPickerPos, setPlaylistPickerPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const anchorIndexRef = useRef<number | null>(null);
  const routeRevalidationRequestedRef = useRef(false);

  useEffect(() => {
    if (routeRevalidationRequestedRef.current) {
      return;
    }
    routeRevalidationRequestedRef.current = true;
    void reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!playlistPickerPos) return;

    const close = () => setPlaylistPickerPos(null);
    const timer = setTimeout(() => document.addEventListener('click', close), 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [playlistPickerPos]);

  useEffect(() => {
    if (selectedIds.size === 0) setDeleteConfirm(false);
  }, [selectedIds]);

  const handleSelectAll = useCallback(() => {
    const currentTracks = filteredTracksRef.current;
    setSelectedIds((prev) => {
      const allSelected =
        currentTracks.length > 0 && currentTracks.every((track) => prev.has(track.id));
      if (allSelected) return new Set();
      return new Set(currentTracks.map((track) => track.id));
    });
  }, []);

  const handleToggleSelect = useCallback((trackId: number, shiftKey: boolean) => {
    const currentTracks = filteredTracksRef.current;
    const currentIndex = currentTracks.findIndex((track) => track.id === trackId);

    if (shiftKey && anchorIndexRef.current !== null && currentIndex >= 0) {
      const start = Math.min(currentIndex, anchorIndexRef.current);
      const end = Math.max(currentIndex, anchorIndexRef.current);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let index = start; index <= end; index++) {
          next.add(currentTracks[index].id);
        }
        return next;
      });
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
    anchorIndexRef.current = currentIndex >= 0 ? currentIndex : null;
  }, []);

  return {
    contextMenu,
    deleteConfirm,
    filteredTracks,
    filteredTracksRef,
    handleSelectAll,
    handleToggleSelect,
    playlistPickerPos,
    selectedIds,
    setContextMenu,
    setDeleteConfirm,
    setPlaylistPickerPos,
    setSelectedIds,
    totalDuration,
    totalSizeLabel,
  };
}
