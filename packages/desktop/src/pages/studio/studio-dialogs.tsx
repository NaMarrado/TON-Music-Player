import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { projectDurationSec, type StudioProject } from '@ton/core';
import { Dialog } from '../../components/ui/dialog';
import { showToast } from '../../stores/toast-store';
import { formatClock } from './studio-format';
import { cancelExport, exportMix, resetProject, useStudioStore } from './studio-store';

function Action({ id, onClick, disabled = false, primary = false, children }: { id: string; onClick: () => void; disabled?: boolean; primary?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="studio-action" data-primary={primary || undefined} data-control={id} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick}>
      {children}
    </button>
  );
}

function suggestName(project: StudioProject, fallback: string): string {
  const names = project.tracks.map((track) => project.assets[track.clips[0]?.assetId ?? '']?.title).filter((name): name is string => Boolean(name));
  if (names.length > 1) return `${names[0]} × ${names[1]}`;
  return names.length === 1 ? `${names[0]} (Studio)` : fallback;
}

/** Mounted only while the dialog is open, so the suggested name is computed from the project at that moment. */
function ExportForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('pages/studio');
  const project = useStudioStore((state) => state.project);
  const exporting = useStudioStore((state) => state.exporting);
  const [title, setTitle] = useState(() => suggestName(useStudioStore.getState().project, t('defaultName')));

  const save = async () => {
    const trackId = await exportMix(title.trim() || t('defaultName'), 'Studio');
    if (trackId !== null) {
      showToast(t('saved'), 'success');
      onClose();
    }
  };

  return (
    <div className="studio-dialog">
      <p className="studio-dialog-text">{t('exportText')}</p>
      <input
        className="studio-dialog-input"
        type="text"
        data-field="mix-name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label={t('mixName')}
        disabled={exporting !== null}
        maxLength={120}
      />
      <div className="studio-dialog-meta">{formatClock(projectDurationSec(project))}</div>
      {exporting && (
        <div className="studio-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exporting.progress * 100)} aria-label={t('exporting')}>
          <i style={{ width: `${Math.round(exporting.progress * 100)}%` }} />
        </div>
      )}
      <div className="studio-dialog-actions">
        <Action id="dialog-cancel" onClick={exporting ? cancelExport : onClose}>{t('cancel')}</Action>
        <Action id="dialog-save" primary onClick={() => void save()} disabled={exporting !== null || title.trim() === ''}>{t('save')}</Action>
      </div>
    </div>
  );
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('pages/studio');
  const busy = useStudioStore((state) => state.exporting !== null);
  return (
    <Dialog open={open} onClose={busy ? () => undefined : onClose} title={t('exportTitle')} width="400px">
      <ExportForm onClose={onClose} />
    </Dialog>
  );
}

export function ClearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('pages/studio');
  return (
    <Dialog open={open} onClose={onClose} title={t('clearTitle')} width="400px">
      <div className="studio-dialog">
        <p className="studio-dialog-text">{t('clearText')}</p>
        <div className="studio-dialog-actions">
          <Action id="dialog-clear-cancel" onClick={onClose}>{t('cancel')}</Action>
          <Action id="dialog-clear-confirm" primary onClick={() => { resetProject(); onClose(); }}>{t('clear')}</Action>
        </div>
      </div>
    </Dialog>
  );
}
