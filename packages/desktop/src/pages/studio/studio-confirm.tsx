import { useEffect, useLayoutEffect, useRef, useState, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface Props {
  /** The button the confirmation belongs to; it opens right under it. */
  anchor: HTMLElement;
  id: string;
  text: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}

const WIDTH = 232;
const GAP = 6;

/**
 * A small confirmation right under the button that asked for it, instead of a dialog over the whole app. Escape, a click
 * anywhere else, scrolling or resizing closes it without doing anything.
 */
export function StudioConfirm({ anchor, id, text, action, onConfirm, onClose }: Props): ReactPortal {
  const { t } = useTranslation('pages/studio');
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const box = anchor.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    setPosition({ top: box.bottom + GAP, left: Math.min(window.innerWidth - WIDTH - 8, Math.max(8, centre - WIDTH / 2)) });
  }, [anchor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && (ref.current?.contains(event.target) || anchor.contains(event.target))) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className="studio-confirm" data-confirm={id} role="alertdialog" aria-label={text} style={{ top: position.top, left: position.left }}>
      <p>{text}</p>
      <div className="studio-confirm-actions">
        <button type="button" data-action="cancel" onClick={onClose}>{t('cancel')}</button>
        <button type="button" data-action="confirm" onClick={() => { onClose(); onConfirm(); }} autoFocus>{action}</button>
      </div>
    </div>,
    document.body,
  );
}
