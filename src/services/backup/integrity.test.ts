import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { db } from '@/services/db/database';
import { listLocations, saveLocation } from '@/services/db/locations';
import { createMap, saveMarker } from '@/services/db/maps';
import { addMedia } from '@/services/db/media';
import { addItemFromText, createCharacter, deleteCharacter } from '@/services/db/play';
import { exportCampaign } from './exportCampaign';
import { applyBackup, readBackupFile } from './importCampaign';
import { readZip, writeZip } from './zip';

/** Régressions issues de la revue du 10 novembre : sauvegardes restaurables et vérifiées. */

const PATTERN = new Uint8Array(64).map((_, i) => (i * 37 + 11) & 0xff);

/** Réécrit une archive en modifiant ses données (les sommes de contrôle restent justes). */
async function tamperJson(zip: Blob, edit: (data: any) => void): Promise<Blob> {
  const entries = await readZip(zip);
  const data = JSON.parse(await (await entries.get('grimoire.json')!.blob()).text());
  edit(data);
  const out = [{ name: 'grimoire.json', data: new Blob([JSON.stringify(data)]) }];
  for (const [name, e] of entries) if (name.startsWith('media/')) out.push({ name, data: await e.blob() });
  return writeZip(out);
}

describe('export', () => {
  it('un média dont le fichier manque donne une archive PARTIELLE mais restaurable', async () => {
    const { campaignId } = await bootstrap();
    const loc = (await listLocations(campaignId))[0];
    const img = await addMedia(campaignId, new Blob([PATTERN], { type: 'image/webp' }), 'image');
    await saveLocation(campaignId, loc.id, { ...loc, imageId: img.id });
    await db.mediaBlobs.delete(img.id); // le fichier a disparu de l'appareil

    const res = await exportCampaign(campaignId);
    expect(res).toMatchObject({ partial: true, mediaCount: 0 });
    expect(res.missingMedia).toHaveLength(1);
    expect(res.filename).toMatch(/-partielle\.zip$/);

    const preview = await readBackupFile(res.blob); // auparavant : « incomplète ou incohérente »
    expect(preview.backup.tables.locations.find((l) => l.id === loc.id)!.imageId).toBeNull();
    await applyBackup(preview);
    expect((await db.locations.get(loc.id))!.imageId).toBeNull();
  });

  it('un export normal n’est pas partiel', async () => {
    const { campaignId } = await bootstrap();
    await addMedia(campaignId, new Blob([PATTERN], { type: 'image/webp' }), 'image');
    expect(await exportCampaign(campaignId)).toMatchObject({ partial: false, missingMedia: [], mediaCount: 1 });
  });
});

describe('import : vérifications', () => {
  it('refuse un média dont un seul octet a été modifié', async () => {
    const { campaignId } = await bootstrap();
    await addMedia(campaignId, new Blob([PATTERN], { type: 'image/webp' }), 'image');
    const { blob } = await exportCampaign(campaignId);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Retrouver le contenu du média dans l'archive (stocké sans compression) et altérer un octet.
    let at = -1;
    for (let i = 0; i + PATTERN.length <= bytes.length && at < 0; i++) if (PATTERN.every((v, j) => bytes[i + j] === v)) at = i;
    expect(at).toBeGreaterThan(0);
    bytes[at + 10] ^= 0xff;
    await expect(readBackupFile(new Blob([bytes]))).rejects.toMatchObject({ details: [expect.stringMatching(/somme de contrôle/)] });
  });

  it('refuse un lieu dont le parent n’existe pas, et un marqueur sans carte', async () => {
    const { campaignId } = await bootstrap();
    const map = await createMap(campaignId, 'Monde', { blob: new Blob([PATTERN], { type: 'image/webp' }), width: 100, height: 100 });
    await saveMarker(campaignId, null, { mapId: map.id, label: 'Tour', x: 1, y: 1 });
    const { blob } = await exportCampaign(campaignId);

    const orphan = await tamperJson(blob, (d) => (d.tables.locations[1].parentId = 'loc_inexistant0000'));
    await expect(readBackupFile(orphan)).rejects.toMatchObject({ details: expect.arrayContaining([expect.stringMatching(/parent introuvable/)]) });

    const noMap = await tamperJson(blob, (d) => (d.tables.markers[0].mapId = 'map_inexistante000'));
    await expect(readBackupFile(noMap)).rejects.toMatchObject({ details: expect.arrayContaining([expect.stringMatching(/carte introuvable/)]) });

    const loop = await tamperJson(blob, (d) => {
      const [a, b] = d.tables.locations;
      a.parentId = b.id;
      b.parentId = a.id;
    });
    await expect(readBackupFile(loop)).rejects.toMatchObject({ details: expect.arrayContaining([expect.stringMatching(/boucle/)]) });
  });

  it('répare et signale les références d’historique devenues vides', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'compagnon', 'Brenna');
    const { item } = await addItemFromText(campaignId, 'arc court', c.id, null);
    const { blob } = await exportCampaign(campaignId);
    // Archive où l'objet vise encore un porteur absent (ex. fiche supprimée par une ancienne version).
    const dangling = await tamperJson(blob, (d) => (d.tables.characters = []));
    const preview = await readBackupFile(dangling);
    expect(preview.corrections).toEqual([expect.stringMatching(/sac commun/)]);
    expect(preview.backup.tables.items.find((i) => i.id === item.id)!.ownerId).toBeNull();
    await deleteCharacter(c.id);
  });
});
