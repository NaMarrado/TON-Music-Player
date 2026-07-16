import { useTranslation } from 'react-i18next';
import { DownloadsHeader } from './downloads-header';
import { CancelAllDialog } from './cancel-all-dialog';
import { DownloadsEmptyState, DownloadsSections } from './download-sections';
import { useDownloadsPageState } from './use-downloads-page-state';

export function DownloadsPage() {
  const { t } = useTranslation('pages/downloads');
  const {
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
  } = useDownloadsPageState();

  const hasClearable = completedItems.length > 0 || failedItems.length > 0;
  const hasCancellable = activeItems.length > 0 || queuedItems.length > 0;
  const totalActive = activeItems.length + queuedItems.length;

  const sections = [
    activeItems.length > 0
      ? { key: 'active', label: t('active'), items: activeItems }
      : null,
    queuedItems.length > 0
      ? { key: 'queued', label: t('queued'), items: queuedItems }
      : null,
    failedItems.length > 0
      ? { key: 'failed', label: t('error'), items: failedItems }
      : null,
    completedItems.length > 0
      ? { key: 'completed', label: t('completed'), items: completedItems }
      : null,
  ].filter((section): section is { key: string; label: string; items: typeof activeItems } => Boolean(section));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <DownloadsHeader
        clearActions={clearActions}
        clearMenuRef={clearMenuRef}
        hasClearable={hasClearable}
        hasCancellable={hasCancellable}
        showClearMenu={showClearMenu}
        t={t}
        totalActive={totalActive}
        onToggleClearMenu={() => setShowClearMenu((value) => !value)}
        onCancelAll={() => setShowCancelAllDialog(true)}
        onClearAction={handleClearAction}
      />

      {items.length === 0 ? <DownloadsEmptyState t={t} /> : <DownloadsSections sections={sections} t={t} />}

      {showCancelAllDialog && (
        <CancelAllDialog
          title={t('cancelAllTitle')}
          description={t('cancelAllMessage')}
          cancelLabel={t('cancel')}
          confirmLabel={t('cancelAllDownloads')}
          isCancelling={isCancellingAll}
          onCancel={() => setShowCancelAllDialog(false)}
          onConfirm={() => { void handleConfirmCancelAll(); }}
        />
      )}
    </div>
  );
}
