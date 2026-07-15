import { useCallback, useEffect, useRef, useState } from 'react';
import type { DownloadItem } from '@ton/core';
import {
  cancelAllDownloads,
  clearAll,
  clearCompleted,
  clearFailed,
  loadDownloads,
  useDownloadStore,
} from '../../../stores/download-store';
import { showToast } from '../../../stores/toast-store';

export function useDownloadsPageState() {
  const orderedIds = useDownloadStore((state) => state.orderedIds);
  const itemsById = useDownloadStore((state) => state.itemsById);
  const items = orderedIds.map((id) => itemsById[id]).filter(Boolean);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showCancelAllDialog, setShowCancelAllDialog] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadDownloads();
  }, []);

  useEffect(() => {
    if (!showClearMenu) return;

    const handleClick = (event: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(event.target as Node)) {
        setShowClearMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showClearMenu]);

  const handleClearAction = useCallback((action: () => Promise<void>) => {
    setShowClearMenu(false);
    void action();
  }, []);

  const handleConfirmCancelAll = useCallback(async () => {
    if (isCancellingAll) return;
    setIsCancellingAll(true);
    try {
      await cancelAllDownloads();
      setShowCancelAllDialog(false);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to cancel downloads',
        'error',
      );
      // Keep the confirmation open so the user can retry.
    } finally {
      setIsCancellingAll(false);
    }
  }, [isCancellingAll]);

  const activeItems = items.filter((item) =>
    ['downloading', 'resolving', 'converting'].includes(item.status),
  );
  const queuedItems = items.filter((item) => item.status === 'pending');
  const failedItems = items
    .filter((item) => item.status === 'error')
    .sort((left, right) => right.id - left.id);
  const completedItems = items.filter((item) => ['done', 'cancelled'].includes(item.status));

  const clearActions = [
    { label: 'clearAll', color: undefined, action: clearAll },
    { label: 'clearCompleted', color: undefined, action: clearCompleted },
    { label: 'clearFailed', color: '#ff4444', action: clearFailed },
  ] as const;

  return {
    activeItems,
    clearActions,
    clearMenuRef,
    completedItems,
    failedItems,
    handleClearAction,
    handleConfirmCancelAll,
    isCancellingAll,
    items,
    queuedItems,
    setShowClearMenu,
    setShowCancelAllDialog,
    showCancelAllDialog,
    showClearMenu,
  };
}

export type DownloadSectionItem = DownloadItem;
