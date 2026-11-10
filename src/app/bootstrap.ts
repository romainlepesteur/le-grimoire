import { db } from '@/services/db/database';
import { getSettings, updateSettings } from '@/services/db/settings';
import { seedDemoCampaign } from '@/data/demo/seed';
import { requestPersistence } from '@/services/storage';

export class StorageUnavailableError extends Error {}

/**
 * Démarrage : ouvre la base, crée la campagne d'exemple au premier lancement,
 * choisit la campagne active et demande un stockage persistant.
 */
export async function bootstrap(): Promise<{ campaignId: string }> {
  try {
    await db.open();
  } catch (e) {
    throw new StorageUnavailableError(
      `Impossible d'ouvrir le stockage local (${(e as Error)?.message ?? e}). ` +
        'Le mode navigation privée ou un espace disque plein peuvent en être la cause.',
    );
  }

  const settings = await getSettings();
  let campaignId = settings.activeCampaignId;
  if (!campaignId || !(await db.campaigns.get(campaignId))) {
    const first = await db.campaigns.orderBy('updatedAt').last();
    campaignId = first ? first.id : await seedDemoCampaign();
    await updateSettings({ activeCampaignId: campaignId });
  }

  void requestPersistence();
  return { campaignId };
}
