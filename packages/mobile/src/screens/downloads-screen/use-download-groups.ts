import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearAll,
  clearCompleted,
  clearFailed,
  useDownloadCount,
  useDownloadIdsByStatus,
} from '../../stores/download-store';
import type { ActionSheetOption } from '../../components/action-sheet';

export function useDownloadGroups() {
  const { t } = useTranslation('downloads');
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const activeDownloadingIds = useDownloadIdsByStatus('downloading');
  const retryingIds = useDownloadIdsByStatus('retrying');
  const pendingIds = useDownloadIdsByStatus('pending');
  const completedIds = useDownloadIdsByStatus('completed');
  const errorIds = useDownloadIdsByStatus('error');
  const itemCount = useDownloadCount();

  const activeIds = useMemo(
    () => [...activeDownloadingIds, ...retryingIds],
    [activeDownloadingIds, retryingIds],
  );
  const activeCount = activeIds.length + pendingIds.length;
  const hasCancellable = activeCount > 0;
  const hasClearable = completedIds.length > 0 || errorIds.length > 0;
  const listEntries = useMemo(() => {
    const entries: Array<
      | { id: string; type: 'section'; label: string }
      | { id: string; type: 'item'; itemId: number }
    > = [];

    const pushSection = (key: string, label: string, ids: number[]) => {
      if (ids.length === 0) return;
      entries.push({ id: `section-${key}`, type: 'section', label });
      for (const itemId of ids) {
        entries.push({ id: `item-${itemId}`, type: 'item', itemId });
      }
    };

    pushSection('active', t('active'), activeIds);
    pushSection('queued', t('queued'), pendingIds);
    pushSection('failed', t('failed'), errorIds);
    pushSection('completed', t('completed'), completedIds);

    return entries;
  }, [activeIds, completedIds, errorIds, pendingIds, t]);

  const clearActions: ActionSheetOption[] = useMemo(() => {
    const actions: ActionSheetOption[] = [];

    if (completedIds.length > 0) {
      actions.push({
        label: t('clearCompleted'),
        icon: 'check-circle',
        onPress: clearCompleted,
      });
    }

    if (errorIds.length > 0) {
      actions.push({
        label: t('clearFailed'),
        icon: 'alert-circle',
        destructive: true,
        onPress: clearFailed,
      });
    }

    if (completedIds.length > 0 && errorIds.length > 0) {
      actions.push({
        label: t('clearAll'),
        icon: 'trash-2',
        destructive: true,
        onPress: clearAll,
      });
    }

    return actions;
  }, [completedIds.length, errorIds.length, t]);

  return {
    activeCount,
    clearActions,
    hasClearable,
    hasCancellable,
    itemCount,
    listEntries,
    showClearMenu,
    setShowClearMenu,
    showImportModal,
    setShowImportModal,
  };
}
