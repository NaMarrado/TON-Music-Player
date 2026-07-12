import type { ReactPortal } from 'react';
import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, width = '360px', children }: DialogProps): ReactPortal | null {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9000 }}
      onClick={onClose}
    >
      <div
        className="rounded-xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', width, padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: 'var(--white)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '20px',
            fontFamily: "'Syne', sans-serif",
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}
