import { create } from 'zustand';

interface PwaState {
  /** Le service worker est actif : l'application fonctionne hors ligne. */
  offlineReady: boolean;
  /** Une nouvelle version a été téléchargée et attend d'être appliquée. */
  needRefresh: boolean;
  applyUpdate: (() => Promise<void>) | null;
}

export const usePwa = create<PwaState>(() => ({
  offlineReady: false,
  needRefresh: false,
  applyUpdate: null,
}));
