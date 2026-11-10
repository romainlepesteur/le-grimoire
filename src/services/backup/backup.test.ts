import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { db } from '@/services/db/database';
import { addMedia, getMediaBlob } from '@/services/db/media';
import { travelTo } from '@/services/db/campaigns';
import { exportCampaign } from './exportCampaign';
import { applyBackup, readBackupFile } from './importCampaign';
import { readZip, writeZip } from './zip';

async function blobToBytes(b: Blob) {
  return new Uint8Array(await b.arrayBuffer());
}

describe('démarrage', () => {
  it('crée la campagne d’exemple une seule fois', async () => {
    const first = await bootstrap();
    const second = await bootstrap();
    expect(second.campaignId).toBe(first.campaignId);
    expect(await db.campaigns.count()).toBe(1);
    const campaign = await db.campaigns.get(first.campaignId);
    expect(campaign?.isDemo).toBe(true);
    const locations = await db.locations.where('campaignId').equals(first.campaignId).toArray();
    expect(locations.length).toBeGreaterThanOrEqual(5);
    expect(locations.every((l) => l.isDemo)).toBe(true);
  });
});

describe('sauvegarde', () => {
  it('export puis import restaure données et médias à l’identique', async () => {
    const { campaignId } = await bootstrap();
    const image = new Blob([new Uint8Array([1, 2, 3, 4, 5, 250])], { type: 'image/webp' });
    const meta = await addMedia(campaignId, Object.assign(image, { name: 'auberge.webp' }), 'image');
    const loc = (await db.locations.where('campaignId').equals(campaignId).first())!;
    await db.locations.update(loc.id, { imageId: meta.id });
    await travelTo(campaignId, loc.id);

    const exported = await exportCampaign(campaignId);
    expect(exported.mediaCount).toBe(1);
    expect(exported.missingMedia).toEqual([]);
    expect(exported.filename).toMatch(/^grimoire-valdoren-campagne-d-exemple-.*\.zip$/);

    // Perte de données simulée : on modifie puis on restaure.
    await db.locations.update(loc.id, { name: 'Nom modifié' });
    await db.mediaBlobs.clear();

    const preview = await readBackupFile(exported.blob);
    expect(preview.existing?.id).toBe(campaignId);
    expect(preview.counts.media).toBe(1);
    await applyBackup(preview);

    const restored = await db.locations.get(loc.id);
    expect(restored?.name).toBe(loc.name);
    expect(restored?.imageId).toBe(meta.id);
    expect((await db.campaigns.get(campaignId))?.currentLocationId).toBe(loc.id);
    const blob = await getMediaBlob(meta.id);
    expect(blob).toBeDefined();
    expect(await blobToBytes(blob!)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 250]));
  });

  it('refuse un ZIP qui n’est pas une sauvegarde', async () => {
    const zip = await writeZip([{ name: 'photo.jpg', data: new Blob(['x']) }]);
    await expect(readBackupFile(zip)).rejects.toThrow(/pas une sauvegarde du Grimoire/);
  });

  it('refuse une sauvegarde d’une version future', async () => {
    const { campaignId } = await bootstrap();
    const { blob } = await exportCampaign(campaignId);
    const data = JSON.parse(await (await (await readZip(blob)).get('grimoire.json')!.blob()).text());
    data.formatVersion = 99;
    const zip = await writeZip([{ name: 'grimoire.json', data: new Blob([JSON.stringify(data)]) }]);
    await expect(readBackupFile(zip)).rejects.toThrow(/version plus récente/);
  });

  it('refuse des données invalides avec un détail lisible, sans rien modifier', async () => {
    const { campaignId } = await bootstrap();
    const { blob } = await exportCampaign(campaignId);
    const data = JSON.parse(await (await (await readZip(blob)).get('grimoire.json')!.blob()).text());
    data.tables.locations[0].kind = 'chateau-volant';
    const zip = await writeZip([{ name: 'grimoire.json', data: new Blob([JSON.stringify(data)]) }]);
    const err = await readBackupFile(zip).catch((e) => e);
    expect(err.message).toMatch(/invalides/);
    expect(err.details.join(' ')).toMatch(/locations › 0 › kind/);
    expect(await db.locations.where('campaignId').equals(campaignId).count()).toBe(data.tables.locations.length);
  });

  it('refuse une sauvegarde dont un média est absent', async () => {
    const { campaignId } = await bootstrap();
    await addMedia(campaignId, new Blob(['son'], { type: 'audio/ogg' }), 'audio');
    const { blob } = await exportCampaign(campaignId);
    const entries = await readZip(blob);
    const json = await entries.get('grimoire.json')!.blob();
    const zip = await writeZip([{ name: 'grimoire.json', data: json }]);
    await expect(readBackupFile(zip)).rejects.toThrow(/incomplète/);
  });
});
