import { db } from '@/services/db/database';
import { getSettings, updateSettings } from '@/services/db/settings';
import { seedDemoCampaign } from '@/data/demo/seed';
import { requestPersistence } from '@/services/storage';

export class StorageUnavailableError extends Error {}

/**
 * Démarrage de l'application : ouvre la base et, au tout premier lancement seulement,
 * crée la campagne d'exemple. Aucune campagne n'est ouverte d'office : l'accueil les présente.
 *
 * La vérification et la création se font dans une seule transaction : deux onglets ouverts
 * en même temps ne peuvent plus créer chacun leur campagne d'exemple.
 */
export async function startup(): Promise<{ lastCampaignId: string | null }> {
  try {
    await db.open();
  } catch (e) {
    throw new StorageUnavailableError(
      `Impossible d'ouvrir le stockage local (${(e as Error)?.message ?? e}). ` +
        'Le mode navigation privée ou un espace disque plein peuvent en être la cause.',
    );
  }

  const lastCampaignId = await db.transaction('rw', db.settings, db.campaigns, db.locations, async () => {
    const settings = await getSettings();
    let last = settings.activeCampaignId;
    if (last && !(await db.campaigns.get(last))) last = null;
    if (!settings.demoSeeded) {
      // Première ouverture (ou installation antérieure à l'accueil, qui a déjà sa campagne).
      if ((await db.campaigns.count()) === 0) last = await seedDemoCampaign();
      await updateSettings({ demoSeeded: true });
    }
    if (last !== settings.activeCampaignId) await updateSettings({ activeCampaignId: last });
    return last;
  });

  void requestPersistence();
  return { lastCampaignId };
}

/**
 * Démarrage avec une campagne garantie (tests et outils) : la dernière ouverte, sinon la plus
 * récente, sinon la campagne d'exemple.
 */
export async function bootstrap(): Promise<{ campaignId: string }> {
  const { lastCampaignId } = await startup();
  let campaignId = lastCampaignId;
  if (!campaignId) {
    const recent = await db.campaigns.orderBy('updatedAt').last();
    campaignId = recent ? recent.id : await seedDemoCampaign();
    await updateSettings({ activeCampaignId: campaignId });
  }
  return { campaignId };
}
