import { create } from 'zustand';
import { getMediaBlob } from '@/services/db/media';

/** Écoute d'un seul son de la bibliothèque (hors moteur d'ambiance). */
interface PreviewState {
  playingId: string | null;
  toggle: (mediaId: string) => Promise<void>;
  stop: () => void;
}

let el: HTMLAudioElement | null = null;
let url: string | null = null;

function release() {
  el?.pause();
  if (url) URL.revokeObjectURL(url);
  el = null;
  url = null;
}

export const usePreview = create<PreviewState>((set, get) => ({
  playingId: null,
  stop: () => {
    release();
    set({ playingId: null });
  },
  toggle: async (mediaId) => {
    const was = get().playingId;
    get().stop();
    if (was === mediaId) return;
    const blob = await getMediaBlob(mediaId);
    if (!blob) return;
    url = URL.createObjectURL(blob);
    el = new Audio(url);
    el.volume = 0.8;
    el.onended = () => get().stop();
    set({ playingId: mediaId });
    await el.play().catch(() => get().stop());
  },
}));
