import { create } from 'zustand';
import type { CheckTarget } from '@/domain/checks';

/** Jet demandé depuis une fiche (caractéristique ou compétence d'un personnage). */
interface CheckState {
  request: { characterId: string; target: CheckTarget } | null;
  open: (characterId: string, target: CheckTarget) => void;
  close: () => void;
}

export const useCheck = create<CheckState>((set) => ({
  request: null,
  open: (characterId, target) => set({ request: { characterId, target } }),
  close: () => set({ request: null }),
}));
