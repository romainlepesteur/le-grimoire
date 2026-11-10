import { create } from 'zustand';

/**
 * Mode Jeu : consultation uniquement, aucun formulaire, rien ne peut être modifié par erreur.
 * Mode Préparation : création et modification (lieux, médias, ambiances, brouillard…).
 * L'application démarre TOUJOURS en mode Jeu.
 */
export type AppMode = 'jeu' | 'preparation';

interface SessionState {
  campaignId: string | null;
  mode: AppMode;
  immersive: boolean;
  diceOpen: boolean;
  setCampaignId: (id: string) => void;
  setMode: (mode: AppMode) => void;
  setImmersive: (v: boolean) => void;
  setDiceOpen: (v: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  campaignId: null,
  mode: 'jeu',
  immersive: false,
  diceOpen: false,
  setCampaignId: (campaignId) => set({ campaignId }),
  setMode: (mode) => set({ mode }),
  setImmersive: (immersive) => set({ immersive }),
  setDiceOpen: (diceOpen) => set({ diceOpen }),
}));

export const useIsPrep = () => useSession((s) => s.mode === 'preparation');
