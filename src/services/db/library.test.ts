import { describe, expect, it } from 'vitest';
import { bootstrap, startup } from '@/app/bootstrap';
import { exportCampaign } from '@/services/backup/exportCampaign';
import { applyBackup, readBackupFile } from '@/services/backup/importCampaign';
import { readZip, writeZip } from '@/services/backup/zip';
import { addItemFromText, createCharacter } from './play';
import {
  campaignCoverImage,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  removeCampaignCover,
  setCampaignCover,
} from './campaigns';
import { CAMPAIGN_TABLES, db } from './database';
import { listLocations, saveLocation } from './locations';
import { addMedia, deleteMediaIfUnused } from './media';
import { getSettings } from './settings';

/** Bibliothèque de campagnes : plusieurs campagnes sur l'appareil, chacune avec sa couverture. */

const image = (seed: number) => new Blob([new Uint8Array(32).map((_, i) => (i * 7 + seed) & 0xff)], { type: 'image/webp' });
const SIZE = { width: 1000, height: 1500 };

describe('démarrage', () => {
  it('crée la campagne d’exemple au premier lancement, sans l’ouvrir d’office', async () => {
    const { lastCampaignId } = await startup();
    const all = await listCampaigns();
    expect(all).toHaveLength(1);
    expect(all[0].isDemo).toBe(true);
    expect(lastCampaignId).toBe(all[0].id);
  });

  it('deux démarrages simultanés ne créent qu’une campagne d’exemple (régression)', async () => {
    await Promise.all([startup(), startup(), startup()]);
    expect(await db.campaigns.count()).toBe(1);
  });

  it('une campagne d’exemple supprimée ne revient pas au lancement suivant', async () => {
    const { lastCampaignId } = await startup();
    await deleteCampaign(lastCampaignId!);
    expect((await startup()).lastCampaignId).toBeNull();
    expect(await db.campaigns.count()).toBe(0);
  });

  it('une installation antérieure à l’accueil garde sa campagne, sans doublon', async () => {
    await db.open();
    const mine = await createCampaign('Ma campagne'); // campagne présente, réglage « demoSeeded » absent
    const { lastCampaignId } = await startup();
    expect(await db.campaigns.count()).toBe(1);
    expect(lastCampaignId).toBeNull(); // aucune « dernière partie » connue : l'accueil la présente simplement
    expect((await listCampaigns())[0].id).toBe(mine.id);
  });
});

describe('plusieurs campagnes', () => {
  it('crée une campagne vide avec les règles par défaut', async () => {
    await startup();
    const c = await createCampaign('  Les Terres du Nord  ');
    expect(c).toMatchObject({ name: 'Les Terres du Nord', isDemo: false, coverId: null, currentLocationId: null });
    expect(c.rules.abilities.length).toBeGreaterThan(0);
    await expect(createCampaign('   ')).rejects.toThrow();
    expect(await db.campaigns.count()).toBe(2);
  });

  it('supprimer une campagne efface tout son contenu et rien de celui des autres', async () => {
    const { campaignId: demo } = await bootstrap();
    const other = await createCampaign('Autre');
    const hero = await createCharacter(other.id, 'pj', 'Aldric');
    await addItemFromText(other.id, 'une vieille clé', hero.id, null);
    await addMedia(other.id, image(1), 'image');
    await setCampaignCover(other.id, image(2), SIZE);
    const demoLocations = (await listLocations(demo)).length;
    await setCampaignCover(demo, image(3), SIZE);

    await deleteCampaign(other.id);

    expect(await db.campaigns.get(other.id)).toBeUndefined();
    for (const name of CAMPAIGN_TABLES) {
      expect(await db.table(name).where('campaignId').equals(other.id).count(), name).toBe(0);
    }
    expect(await db.mediaBlobs.where('campaignId').equals(other.id).count()).toBe(0);
    // L'autre campagne est intacte.
    expect((await listLocations(demo)).length).toBe(demoLocations);
    expect(await db.mediaBlobs.where('campaignId').equals(demo).count()).toBe(1);
    expect((await getSettings()).activeCampaignId).toBe(demo);
  });

  it('supprimer la dernière campagne ouverte efface le repère « dernière partie »', async () => {
    const { campaignId } = await bootstrap();
    await deleteCampaign(campaignId);
    expect((await getSettings()).activeCampaignId).toBeNull();
  });
});

describe('couverture', () => {
  it('remplacer la couverture efface l’ancienne image ; la retirer aussi', async () => {
    const { campaignId } = await bootstrap();
    await setCampaignCover(campaignId, image(1), SIZE);
    const first = (await db.campaigns.get(campaignId))!.coverId!;
    // Une couverture en service n'est jamais considérée comme inutilisée.
    expect(await deleteMediaIfUnused(first)).toBe(false);

    await setCampaignCover(campaignId, image(2), SIZE);
    const second = (await db.campaigns.get(campaignId))!.coverId!;
    expect(second).not.toBe(first);
    expect(await db.mediaBlobs.get(first)).toBeUndefined();

    await removeCampaignCover(campaignId);
    expect((await db.campaigns.get(campaignId))!.coverId).toBeNull();
    expect(await db.mediaMeta.get(second)).toBeUndefined();
  });

  it('sans couverture, l’accueil montre l’illustration de la région', async () => {
    const { campaignId } = await bootstrap();
    const campaign = (await db.campaigns.get(campaignId))!;
    expect(await campaignCoverImage(campaign)).toBeNull();
    const locations = await listLocations(campaignId);
    const inn = locations.find((l) => l.kind === 'lieu')!;
    const region = locations.find((l) => l.kind === 'region')!;
    const a = await addMedia(campaignId, image(1), 'image');
    const b = await addMedia(campaignId, image(2), 'image');
    await saveLocation(campaignId, inn.id, { ...inn, imageId: a.id });
    expect(await campaignCoverImage(campaign)).toBe(a.id);
    await saveLocation(campaignId, region.id, { ...region, imageId: b.id });
    expect(await campaignCoverImage(campaign)).toBe(b.id);
  });

  it('la couverture voyage dans le pack et se restaure sur un appareil vide', async () => {
    const { campaignId } = await bootstrap();
    await setCampaignCover(campaignId, image(9), SIZE);
    const coverId = (await db.campaigns.get(campaignId))!.coverId!;
    const { blob } = await exportCampaign(campaignId);

    await deleteCampaign(campaignId);
    const restored = await applyBackup(await readBackupFile(blob));

    expect(restored).toBe(campaignId);
    expect((await db.campaigns.get(campaignId))!.coverId).toBe(coverId);
    const stored = (await db.mediaBlobs.get(coverId))!.blob;
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(new Uint8Array(await image(9).arrayBuffer()));
  });

  it('un pack dont la couverture vise une image absente est refusé', async () => {
    const { campaignId } = await bootstrap();
    const { blob } = await exportCampaign(campaignId);
    const entries = await readZip(blob);
    const data = JSON.parse(await (await entries.get('grimoire.json')!.blob()).text());
    data.campaign.coverId = 'med_inconnu000000000';
    const tampered = await writeZip([{ name: 'grimoire.json', data: new Blob([JSON.stringify(data)]) }]);
    await expect(readBackupFile(tampered)).rejects.toThrow(/incomplète ou incohérente/);
  });

  it('une couverture dont le fichier a disparu donne un export partiel, toujours restaurable', async () => {
    const { campaignId } = await bootstrap();
    await setCampaignCover(campaignId, image(4), SIZE);
    await db.mediaBlobs.delete((await db.campaigns.get(campaignId))!.coverId!);
    const res = await exportCampaign(campaignId);
    expect(res.partial).toBe(true);
    expect((await readBackupFile(res.blob)).backup.campaign.coverId).toBeNull();
  });
});
