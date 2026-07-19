import type { ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, dismissToast } from '../../stores/toast-store';
import type { ToastType } from '../../stores/toast-store';
import { useUIStore } from '../../stores/ui-store';
import { DESKTOP_QUEUE_PANEL_WIDTH } from '../../shared/layout';

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: '#4ade80' }}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: '14px', height: '14px', color: '#ff4444' }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  if (type === 'loading') {
    return (
      <div
        className="animate-spin rounded-full"
        style={{
          width: '14px',
          height: '14px',
          border: '2px solid var(--text-secondary)',
          borderTopColor: 'transparent',
        }}
      />
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: '14px', height: '14px', color: 'var(--text-secondary)' }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function ToastContainer(): ReactPortal | null {
  const toasts = useToastStore((s) => s.toasts);
  const queueOpen = useUIStore((s) => s.queueOpen);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed flex flex-col gap-2"
      style={{
        top: 'var(--desktop-page-top)',
        right: queueOpen ? `${DESKTOP_QUEUE_PANEL_WIDTH + 16}px` : '16px',
        maxWidth: '340px',
        pointerEvents: 'none',
        zIndex: 9500,
        transition: 'right 200ms ease',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-enter flex items-center gap-2.5"
          onClick={() => { if (toast.type !== 'loading') dismissToast(toast.id); }}
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          <ToastIcon type={toast.type} />
          <span
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
              lineHeight: '1.4',
            }}
          >
            {toast.message}
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
