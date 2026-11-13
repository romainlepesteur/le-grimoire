import { CAMPAIGN_TABLES, db } from './database';
import { addMedia, deleteMediaIfUnused } from './media';
import { getSettings, updateSettings } from './settings';
import { newId } from '@/domain/ids';
import { campaignSchema, type Campaign } from '@/domain/schemas';

export function getCampaign(id: string): Promise<Campaign | undefined> {
  return db.campaigns.get(id);
}

export function listCampaigns(): Promise<Campaign[]> {
  return db.campaigns.orderBy('updatedAt').reverse().toArray();
}

export async function renameCampaign(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Le nom de la campagne ne peut pas être vide.');
  // Renommer la campagne d'exemple, c'est l'adopter : elle n'est plus présentée comme un exemple.
  await db.campaigns.update(id, { name: clean, isDemo: false, updatedAt: Date.now() });
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

/** Crée une campagne vide (règles par défaut, aucun lieu). */
export async function createCampaign(name: string): Promise<Campaign> {
  const now = Date.now();
  const campaign = campaignSchema.parse({ id: newId('campaign'), name, createdAt: now, updatedAt: now });
  await db.campaigns.add(campaign);
  return campaign;
}

/**
 * Supprime une campagne et tout ce qu'elle contient (lieux, médias, fiches, journal…),
 * en une seule transaction : tout ou rien. Les autres campagnes ne sont pas touchées.
 */
export async function deleteCampaign(id: string): Promise<void> {
  const tables = [db.campaigns, db.mediaBlobs, db.settings, ...CAMPAIGN_TABLES.map((n) => db.table(n))];
  await db.transaction('rw', tables, async () => {
    for (const name of CAMPAIGN_TABLES) await db.table(name).where('campaignId').equals(id).delete();
    await db.mediaBlobs.where('campaignId').equals(id).delete();
    await db.campaigns.delete(id);
    if ((await getSettings()).activeCampaignId === id) await updateSettings({ activeCampaignId: null });
  });
}

/** Remplace l'image de couverture d'une campagne ; l'ancienne est effacée si plus rien ne l'utilise. */
export async function setCampaignCover(
  campaignId: string,
  image: Blob,
  size: { width: number; height: number },
): Promise<void> {
  const campaign = await db.campaigns.get(campaignId);
  if (!campaign) throw new Error('Campagne introuvable.');
  const meta = await addMedia(campaignId, image, 'image', { ...size, name: `Couverture — ${campaign.name}` });
  await db.campaigns.update(campaignId, { coverId: meta.id, updatedAt: Date.now() });
  if (campaign.coverId) await deleteMediaIfUnused(campaign.coverId);
}

/** Retire la couverture : l'accueil affiche alors une illustration de la campagne. */
export async function removeCampaignCover(campaignId: string): Promise<void> {
  const campaign = await db.campaigns.get(campaignId);
  if (!campaign?.coverId) return;
  await db.campaigns.update(campaignId, { coverId: null, updatedAt: Date.now() });
  await deleteMediaIfUnused(campaign.coverId);
}

/**
 * Image montrée sur l'accueil : la couverture choisie, sinon l'illustration de la région
 * principale, sinon celle du premier lieu illustré.
 */
export async function campaignCoverImage(campaign: Campaign): Promise<string | null> {
  if (campaign.coverId) return campaign.coverId;
  const illustrated = (await db.locations.where('campaignId').equals(campaign.id).toArray())
    .filter((l) => l.imageId)
    .sort((a, b) => Number(b.kind === 'region') - Number(a.kind === 'region') || a.sortOrder - b.sortOrder);
  return illustrated[0]?.imageId ?? null;
}
