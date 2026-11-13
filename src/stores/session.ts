import { create } from 'zustand';

/**
 * Mode Jeu : consultation uniquement, aucun formulaire, rien ne peut être modifié par erreur.
 * Mode Préparation : création et modification (lieux, médias, ambiances, brouillard…).
 * L'application démarre TOUJOURS en mode Jeu.
 */
/** Onglet de l'ajout rapide. */
export type QuickTab = 'objet' | 'note' | 'pv';

export type AppMode = 'jeu' | 'preparation';

interface SessionState {
  /** Campagne ouverte ; `null` : l'accueil (choix de la campagne) est affiché. */
  campaignId: string | null;
  mode: AppMode;
  immersive: boolean;
  diceOpen: boolean;
  /** Ajout rapide (objet, note, points de vie). */
  quickOpen: boolean;
  quickTab: QuickTab;
  setCampaignId: (id: string) => void;
  /** Revient à l'accueil : referme les tiroirs et repasse en mode Jeu. */
  closeCampaign: () => void;
  setMode: (mode: AppMode) => void;
  setImmersive: (v: boolean) => void;
  setDiceOpen: (v: boolean) => void;
  setQuickOpen: (v: boolean, tab?: QuickTab) => void;
}

export const useSession = create<SessionState>((set) => ({
  campaignId: null,
  mode: 'jeu',
  immersive: false,
  diceOpen: false,
  quickOpen: false,
  quickTab: 'objet',
  setCampaignId: (campaignId) => set({ campaignId }),
  closeCampaign: () => set({ campaignId: null, mode: 'jeu', immersive: false, diceOpen: false, quickOpen: false }),
  setMode: (mode) => set({ mode }),
  setImmersive: (immersive) => set({ immersive }),
  setDiceOpen: (diceOpen) => set({ diceOpen }),
  setQuickOpen: (quickOpen, tab) => set((st) => ({ quickOpen, quickTab: tab ?? st.quickTab })),
}));

export const useIsPrep = () => useSession((s) => s.mode === 'preparation');
