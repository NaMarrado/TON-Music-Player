import { useEffect, useMemo, useState } from 'react';
import { VirtualizedList } from '../../../components/player/virtualized-list';
import { Dialog } from '../../../components/ui/dialog';

export interface PickItem {
  id: number;
  label: string;
  detail?: string;
}

interface Props {
  open: boolean;
  title: string;
  items: PickItem[];
  /** Shows a search box that narrows the list (songs). */
  searchPlaceholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (ids: number[]) => void;
  onClose: () => void;
}

const ROW = 40;

/** A tick list in a small pop-up: tick what you want, confirm. Used for playlists and songs, for export and import. */
export function PickDialog({ open, title, items, searchPlaceholder, confirmLabel, cancelLabel, onConfirm, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPicked(new Set());
  }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(needle)) : items;
  }, [items, query]);

  const toggle = (id: number) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <Dialog open={open} onClose={onClose} title={title} width="440px">
      <div className="transfer-pick" data-pick-dialog>
        {searchPlaceholder !== undefined && (
          <input
            className="transfer-pick-search"
            data-pick-search
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        )}
        <VirtualizedList
          className="transfer-pick-list"
          estimateSize={ROW}
          items={visible}
          keyExtractor={(item) => item.id}
          renderItem={(item) => (
            <label className="transfer-pick-row" data-pick-id={item.id} style={{ height: ROW }}>
              <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} />
              <span className="transfer-pick-label">{item.label}</span>
              {item.detail && <span className="transfer-pick-detail">{item.detail}</span>}
            </label>
          )}
        />
        <div className="transfer-pick-actions">
          <button type="button" className="transfer-pick-cancel" onClick={onClose}>{cancelLabel}</button>
          <button
            type="button"
            className="transfer-pick-confirm"
            data-pick-confirm
            disabled={picked.size === 0}
            onClick={() => onConfirm(items.filter((item) => picked.has(item.id)).map((item) => item.id))}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
