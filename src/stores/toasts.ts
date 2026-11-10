import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
  /** ms ; 0 = reste affiché jusqu'à fermeture. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++counter;
    const duration = t.duration ?? (t.tone === 'error' ? 0 : 4500);
    set({ toasts: [...get().toasts, { ...t, id, duration }].slice(-4) });
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = (t: Parameters<ToastState['push']>[0]) => useToasts.getState().push(t);
