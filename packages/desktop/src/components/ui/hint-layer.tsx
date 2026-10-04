import { useEffect, useId, useState, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import './hint-layer.css';

interface ActiveHint {
  text: string;
  /** A plain-language sentence under the name. Without it the bubble is a single line. */
  description: string | null;
  x: number;
  y: number;
  above: boolean;
}

const SHOW_DELAY_MS = 180;
const HALF_WIDTH = 150;

/**
 * One tooltip for every element inside `scope` that has `data-hint`. Native `title` bubbles are slow, unstyled and
 * invisible to keyboard users; this reacts to hover and focus and is portaled out of clipped (overflow: hidden) panels.
 * Anything marked `data-hint-suppress` (an open dropdown) silences it while present.
 */
export function HintLayer({ scope }: { scope: string }): ReactPortal | null {
  const [hint, setHint] = useState<ActiveHint | null>(null);
  const id = useId();

  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      current?.removeAttribute('aria-describedby');
      current = null;
      setHint(null);
    };
    const show = (element: Element) => {
      const text = element.getAttribute('data-hint');
      if (!text) return;
      const description = element.getAttribute('data-hint-text');
      hide();
      current = element;
      timer = window.setTimeout(() => {
        const rect = element.getBoundingClientRect();
        const above = rect.bottom + (description ? 140 : 72) > window.innerHeight;
        const x = Math.min(Math.max(rect.left + rect.width / 2, HALF_WIDTH + 8), window.innerWidth - HALF_WIDTH - 8);
        element.setAttribute('aria-describedby', id);
        setHint({ text, description, x, y: above ? rect.top : rect.bottom, above });
      }, SHOW_DELAY_MS);
    };
    const onEnter = (event: Event) => {
      if (document.querySelector('[data-hint-suppress]')) return;
      const target = event.target instanceof Element ? event.target.closest('[data-hint]') : null;
      if (!target || !target.closest(scope)) {
        if (current) hide();
        return;
      }
      if (target !== current) show(target);
    };
    const onLeave = (event: Event) => {
      const related = (event as PointerEvent | FocusEvent).relatedTarget;
      if (current && !(related instanceof Node && current.contains(related))) hide();
    };
    document.addEventListener('pointerover', onEnter);
    document.addEventListener('focusin', onEnter);
    document.addEventListener('pointerout', onLeave);
    document.addEventListener('focusout', onLeave);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      hide();
      document.removeEventListener('pointerover', onEnter);
      document.removeEventListener('focusin', onEnter);
      document.removeEventListener('pointerout', onLeave);
      document.removeEventListener('focusout', onLeave);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, [id, scope]);

  if (!hint) return null;
  return createPortal(
    <div id={id} role="tooltip" className="hint-bubble" data-above={hint.above} data-explained={hint.description ? 'true' : undefined} style={{ left: hint.x, top: hint.y }}>
      {hint.description ? (
        <>
          <strong className="hint-name">{hint.text}</strong>
          <span className="hint-text">{hint.description}</span>
        </>
      ) : (
        hint.text
      )}
    </div>,
    document.body,
  );
}
