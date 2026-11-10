import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { db } from './database';
import { createAmbiance, deleteAmbiance, newLayer, saveAmbiance } from './ambiances';
import { travelTo } from './campaigns';
import { deleteLocation, listLocations, saveLocation } from './locations';
import { addMedia, deleteSound, mediaUsage } from './media';

const img = (name: string) => Object.assign(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), { name });

describe('édition des lieux', () => {
  it('crée un lieu sous une zone puis refuse un quatrième niveau', async () => {
    const { campaignId } = await bootstrap();
    const all = await listLocations(campaignId);
    const ville = all.find((l) => l.name === 'Valdoren' && l.kind === 'zone')!;
    const auberge = all.find((l) => l.name.includes('Cerf'))!;

    const forge = await saveLocation(campaignId, null, {
      name: '  La Forge  ',
      kind: 'lieu',
      parentId: ville.id,
      description: '',
      theme: 'ville',
      imageId: null,
      ambianceId: null,
    });
    expect(forge.name).toBe('La Forge');
    expect(forge.isDemo).toBe(false);

    await expect(
      saveLocation(campaignId, null, { ...forge, name: 'Cave', parentId: auberge.id }),
    ).rejects.toThrow(/trois niveaux/);
  });

  it('remplacer une illustration efface l’ancienne si plus rien ne l’utilise', async () => {
    const { campaignId } = await bootstrap();
    const loc = (await listLocations(campaignId)).find((l) => l.kind === 'lieu')!;
    const a = await addMedia(campaignId, img('a.webp'), 'image');
    await saveLocation(campaignId, loc.id, { ...loc, imageId: a.id });
    const b = await addMedia(campaignId, img('b.webp'), 'image');
    await saveLocation(campaignId, loc.id, { ...loc, imageId: b.id });
    expect(await db.mediaMeta.get(a.id)).toBeUndefined();
    expect(await db.mediaBlobs.get(a.id)).toBeUndefined();
    expect(await db.mediaMeta.get(b.id)).toBeDefined();
  });

  it('supprime un lieu et ses sous-lieux, et ramène le personnage au parent', async () => {
    const { campaignId } = await bootstrap();
    const all = await listLocations(campaignId);
    const ville = all.find((l) => l.name === 'Valdoren' && l.kind === 'zone')!;
    const auberge = all.find((l) => l.name.includes('Cerf'))!;
    await travelTo(campaignId, auberge.id);

    const { deleted } = await deleteLocation(campaignId, ville.id);
    const childCount = all.filter((l) => l.parentId === ville.id).length;
    expect(deleted).toBe(1 + childCount);
    expect((await db.campaigns.get(campaignId))!.currentLocationId).toBe(ville.parentId);
    expect(await db.locations.get(auberge.id)).toBeUndefined();
  });
});

describe('ambiances', () => {
  it('supprimer une ambiance libère les lieux ; supprimer un son le retire des couches', async () => {
    const { campaignId } = await bootstrap();
    const loc = (await listLocations(campaignId))[0];
    const sound = await addMedia(campaignId, Object.assign(new Blob([new Uint8Array(10)], { type: 'audio/ogg' }), { name: 'feu.ogg' }), 'audio');
    const amb = await createAmbiance(campaignId, 'Taverne');
    await saveAmbiance({ ...amb, layers: [newLayer(sound.id, 'sfx')] });
    await saveLocation(campaignId, loc.id, { ...loc, ambianceId: amb.id });

    expect((await mediaUsage(campaignId)).get(sound.id)?.ambiances).toEqual(['Taverne']);

    await deleteSound(sound.id);
    expect((await db.ambiances.get(amb.id))!.layers).toEqual([]);

    expect(await deleteAmbiance(amb.id)).toBe(1);
    expect((await db.locations.get(loc.id))!.ambianceId).toBeNull();
  });
});
