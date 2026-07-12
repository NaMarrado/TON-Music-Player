import { ImportPlaylistButton } from '../../../../components/ui/import-playlist-button';
import { CancelAllButton } from '../cancel-all-button';
import { ClearMenu } from './clear-menu';
import { DownloadsTitleBlock } from './title-block';

type DownloadsHeaderProps = {
  hasClearable: boolean;
  hasCancellable: boolean;
  showClearMenu: boolean;
  t: (key: string) => string;
  totalActive: number;
  clearMenuRef: React.RefObject<HTMLDivElement | null>;
  onToggleClearMenu: () => void;
  onCancelAll: () => void;
  onClearAction: (action: () => Promise<void>) => void;
  clearActions: ReadonlyArray<{
    label: 'clearAll' | 'clearCompleted' | 'clearFailed';
    color?: string;
    action: () => Promise<void>;
  }>;
};

export function DownloadsHeader({
  clearActions,
  clearMenuRef,
  hasClearable,
  hasCancellable,
  onCancelAll,
  onClearAction,
  onToggleClearMenu,
  showClearMenu,
  t,
  totalActive,
}: DownloadsHeaderProps) {
  return (
    <div
      className="flex items-center justify-between shrink-0 sticky top-0 z-10"
      style={{
        padding: '44px 32px 20px',
        background: 'linear-gradient(var(--bg-deep) 60%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <DownloadsTitleBlock t={t} totalActive={totalActive} />
      <div className="flex items-center gap-2">
        <ImportPlaylistButton />
        {hasCancellable && (
          <CancelAllButton label={t('cancelAllDownloads')} onClick={onCancelAll} />
        )}
        {hasClearable && (
          <ClearMenu
            clearActions={clearActions}
            clearMenuRef={clearMenuRef}
            onClearAction={onClearAction}
            onToggleClearMenu={onToggleClearMenu}
            showClearMenu={showClearMenu}
            t={t}
          />
        )}
      </div>
    </div>
  );
}
