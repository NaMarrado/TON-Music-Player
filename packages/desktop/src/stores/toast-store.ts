import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** Auto-dismiss after ms (default 3000). Set 0 to persist. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
}

export const useToastStore = create<ToastState>()(() => ({
  toasts: [],
}));

let counter = 0;
const recentMessages = new Map<string, number>();

/** Show a toast notification. Returns the toast id. */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = 3000,
): string {
  // Deduplicate: skip if same message+type was shown in the last 500ms
  const dedupeKey = `${type}:${message}`;
  const now = Date.now();
  const lastShown = recentMessages.get(dedupeKey);
  if (lastShown && now - lastShown < 500) {
    return '';
  }
  recentMessages.set(dedupeKey, now);
  // Prevent unbounded growth — purge stale entries periodically
  if (recentMessages.size > 50) {
    for (const [key, ts] of recentMessages) {
      if (now - ts > 2000) recentMessages.delete(key);
    }
  }

  const id = `toast-${++counter}`;
  const toast: Toast = { id, type, message, duration };

  useToastStore.setState((s) => ({
    toasts: [...s.toasts, toast],
  }));

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

/** Dismiss a toast by id. */
export function dismissToast(id: string): void {
  useToastStore.setState((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  }));
}
