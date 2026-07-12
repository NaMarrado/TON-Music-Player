import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
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

export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = 3000,
): string {
  const dedupeKey = `${type}:${message}`;
  const now = Date.now();
  const lastShown = recentMessages.get(dedupeKey);
  if (lastShown && now - lastShown < 500) return '';

  recentMessages.set(dedupeKey, now);
  if (recentMessages.size > 50) {
    for (const [key, ts] of recentMessages) {
      if (now - ts > 2000) recentMessages.delete(key);
    }
  }

  const id = `toast-${counter++}`;
  const toast: Toast = { id, type, message, duration };

  useToastStore.setState((s) => ({ toasts: [...s.toasts, toast] }));

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

export function dismissToast(id: string): void {
  useToastStore.setState((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  }));
}
