import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { rulesOf, type Character, type DiceRoll, type Item, type JournalEntry, type Rules } from '@/domain/schemas';
import { useActiveCampaign } from '@/hooks/data';
import { db } from '@/services/db/database';

/** Accès en direct aux données de partie de la campagne. */

export function useCharacters(campaignId: string | undefined): Character[] | undefined {
  return useLiveQuery(
    async () =>
      campaignId
        ? (await db.characters.where('campaignId').equals(campaignId).toArray()).sort(
            (a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind === 'pj' ? -1 : 1),
          )
        : [],
    [campaignId],
  );
}

export function useItems(campaignId: string | undefined): Item[] | undefined {
  return useLiveQuery(() => (campaignId ? db.items.where('campaignId').equals(campaignId).toArray() : []), [campaignId]);
}

export function useJournal(campaignId: string | undefined): JournalEntry[] | undefined {
  return useLiveQuery(() => (campaignId ? db.journal.where('campaignId').equals(campaignId).toArray() : []), [campaignId]);
}

export function useDiceRolls(campaignId: string | undefined, limit = 40): DiceRoll[] | undefined {
  return useLiveQuery(
    async () =>
      campaignId ? (await db.diceRolls.where('campaignId').equals(campaignId).sortBy('createdAt')).reverse().slice(0, limit) : [],
    [campaignId, limit],
  );
}

/** Le personnage joueur (le premier, s'il y en a plusieurs). */
export const findPj = (list: Character[] | undefined) => list?.find((c) => c.kind === 'pj');

export const ownerLabel = (ownerId: string | null, characters: Character[] | undefined) =>
  ownerId ? (characters?.find((c) => c.id === ownerId)?.name ?? 'Porteur inconnu') : 'Sac commun';

/** Règles de jeu de la campagne active (valeurs par défaut si elle n'en a pas encore). */
export function useRules(): Rules {
  const campaign = useActiveCampaign();
  return useMemo(() => rulesOf(campaign), [campaign]);
}
