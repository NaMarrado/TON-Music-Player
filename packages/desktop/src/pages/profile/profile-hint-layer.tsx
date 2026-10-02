import { useEffect, useId, useState, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';

interface ActiveHint {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

const SHOW_DELAY_MS = 180;
const HALF_WIDTH = 150;

/**
 * One tooltip for everything in the Profile page that has `data-hint`. Native `title`
 * bubbles are slow, unstyled and invisible to keyboard users; this reacts to hover and focus
 * and is portaled out of clipped (overflow: hidden) panels.
 */
export function ProfileHintLayer(): ReactPortal | null {
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
      hide();
      current = element;
      timer = window.setTimeout(() => {
        const rect = element.getBoundingClientRect();
        const above = rect.bottom + 72 > window.innerHeight;
        const x = Math.min(Math.max(rect.left + rect.width / 2, HALF_WIDTH + 8), window.innerWidth - HALF_WIDTH - 8);
        element.setAttribute('aria-describedby', id);
        setHint({ text, x, y: above ? rect.top : rect.bottom, above });
      }, SHOW_DELAY_MS);
    };
    const onEnter = (event: Event) => {
      // An open dropdown owns the pointer; a bubble over its options would hide them.
      if (document.querySelector('.profile-select-list')) return;
      const target = event.target instanceof Element ? event.target.closest('[data-hint]') : null;
      if (!target || !target.closest('.profile-page')) {
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
  }, [id]);

  if (!hint) return null;
  return createPortal(
    <div
      id={id}
      role="tooltip"
      className="profile-hint"
      data-above={hint.above}
      style={{ left: hint.x, top: hint.y }}
    >
      {hint.text}
    </div>,
    document.body,
  );
}
