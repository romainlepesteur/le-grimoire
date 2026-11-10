import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { createAmbiance, newLayer, saveAmbiance } from '@/services/db/ambiances';
import { travelTo } from '@/services/db/campaigns';
import { listLocations, saveLocation } from '@/services/db/locations';
import { createMap, saveFogMask, saveMarker } from '@/services/db/maps';
import { addMedia } from '@/services/db/media';
import { exportCampaign } from './exportCampaign';
import { readBackupFile } from './importCampaign';
import { readZip, writeZip } from './zip';

/**
 * Génère les sauvegardes de référence (à ne lancer qu'une fois, volontairement) :
 *   GEN_FIXTURES=1 npx vitest run src/services/backup/fixtures.gen.test.ts
 * Elles servent ensuite à vérifier que toute évolution (bibliothèque de validation,
 * schémas) relit les anciennes sauvegardes à l'identique.
 */
const DIR = 'src/services/backup/__fixtures__';

describe.skipIf(!process.env.GEN_FIXTURES)('génération des sauvegardes de référence', () => {
  it('écrit les fixtures', async () => {
    const { campaignId } = await bootstrap();
    const locs = await listLocations(campaignId);
    const auberge = locs.find((l) => l.name.includes('Cerf'))!;
    const lisiere = locs.find((l) => l.name.startsWith('Lisière'))!;

    const img = await addMedia(campaignId, Object.assign(new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: 'image/webp' }), { name: 'auberge.webp' }), 'image', { width: 1920, height: 1080 });
    const snd = await addMedia(campaignId, Object.assign(new Blob([new Uint8Array([79, 103, 103, 83, 9, 8, 7])], { type: 'audio/ogg' }), { name: 'feu.ogg' }), 'audio', { duration: 31.5 });
    const amb = await createAmbiance(campaignId, 'Taverne', 'Intérieur');
    await saveAmbiance({ ...amb, layers: [newLayer(snd.id, 'sfx'), { ...newLayer(snd.id, 'sfx', false), intervalMin: 12, intervalMax: 40 }] });
    await saveLocation(campaignId, auberge.id, { ...auberge, imageId: img.id, ambianceId: amb.id, description: 'Feu, « guillemets » & accents éèà.' });

    const map = await createMap(campaignId, 'Monde', { blob: new Blob([new Uint8Array([1, 1, 2, 3, 5, 8])], { type: 'image/webp' }), width: 3000, height: 2000 });
    await saveMarker(campaignId, null, { mapId: map.id, locationId: auberge.id, x: 1200.5, y: 900, status: 'connu' });
    await saveMarker(campaignId, null, { mapId: map.id, locationId: lisiere.id, x: 2000, y: 500, status: 'rumeur', radius: 180 });
    await saveMarker(campaignId, null, { mapId: map.id, label: 'Tour en ruine', note: 'Aperçue au loin', x: 10, y: 20, status: 'cache' });
    await saveFogMask(map.id, 'data:image/png;base64,iVBORw0KGgo=');
    await travelTo(campaignId, auberge.id);

    const { blob } = await exportCampaign(campaignId);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(`${DIR}/sauvegarde-v1.zip`, new Uint8Array(await blob.arrayBuffer()));

    // Variante « ancienne » : telle qu'une version antérieure aux phases 2-3 l'aurait produite
    // (champs ajoutés depuis absents), pour vérifier les valeurs par défaut.
    const entries = await readZip(blob);
    const data = JSON.parse(await (await entries.get('grimoire.json')!.blob()).text());
    delete data.campaign.currentMapId;
    for (const a of data.tables.ambiances) for (const l of a.layers) {
      delete l.intervalMin;
      delete l.intervalMax;
    }
    delete data.tables.maps;
    delete data.tables.markers;
    delete data.tables.fogMasks;
    const out = [{ name: 'grimoire.json', data: new Blob([JSON.stringify(data)]) }];
    for (const [name, e] of entries) if (name.startsWith('media/')) out.push({ name, data: await e.blob() });
    const old = await writeZip(out);
    writeFileSync(`${DIR}/sauvegarde-v1-ancienne.zip`, new Uint8Array(await old.arrayBuffer()));

    // Résultat de la validation, tel que produit par la version de référence.
    const expected = {
      actuelle: (await readBackupFile(blob)).backup,
      ancienne: (await readBackupFile(old)).backup,
    };
    writeFileSync(`${DIR}/attendu-v1.json`, JSON.stringify(expected, null, 2));
  });
});
