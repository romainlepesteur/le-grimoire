import { db } from './database';
import type { Campaign } from '@/domain/schemas';

export function getCampaign(id: string): Promise<Campaign | undefined> {
  return db.campaigns.get(id);
}

export function listCampaigns(): Promise<Campaign[]> {
  return db.campaigns.orderBy('updatedAt').reverse().toArray();
}

export async function renameCampaign(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Le nom de la campagne ne peut pas être vide.');
  await db.campaigns.update(id, { name: clean, updatedAt: Date.now() });
}

/**
 * Se rendre dans un lieu : il devient le lieu courant et passe en tête des « récents ».
 * Y être allé, c'est le connaître : ses marqueurs (cachés ou simples rumeurs) deviennent exacts.
 */
export async function travelTo(campaignId: string, locationId: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.campaigns, db.locations, db.markers, async () => {
    const loc = await db.locations.get(locationId);
    if (!loc || loc.campaignId !== campaignId) throw new Error('Lieu introuvable dans cette campagne.');
    await db.locations.update(locationId, { lastVisitedAt: now });
    await db.campaigns.update(campaignId, { currentLocationId: locationId, updatedAt: now });
    await db.markers
      .where('campaignId')
      .equals(campaignId)
      .filter((m) => m.locationId === locationId && m.status !== 'connu')
      .modify({ status: 'connu', updatedAt: now });
  });
}
