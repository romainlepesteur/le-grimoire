import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { rumorCenter } from '@/features/map/fog';
import { exportCampaign } from '@/services/backup/exportCampaign';
import { applyBackup, readBackupFile } from '@/services/backup/importCampaign';
import { travelTo } from './campaigns';
import { db } from './database';
import { deleteLocation, listLocations } from './locations';
import { createMap, deleteMap, fogSize, replaceMapImage, saveFogMask, saveMarker } from './maps';

const image = (w: number, h: number) => ({ blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/webp' }), width: w, height: h });

describe('cartes', () => {
  it('crée une carte affichée, entièrement dans le brouillard', async () => {
    const { campaignId } = await bootstrap();
    const map = await createMap(campaignId, 'Monde', image(4000, 3000));
    expect((await db.campaigns.get(campaignId))!.currentMapId).toBe(map.id);
    const fog = await db.fogMasks.where('mapId').equals(map.id).first();
    expect(fog).toMatchObject({ enabled: true, mask: '', width: 1600, height: 1200 });
    expect(fogSize(1000, 500)).toEqual({ width: 1000, height: 500 });
  });

  it('garde les marqueurs sur la carte et les fait suivre un changement d’image', async () => {
    const { campaignId } = await bootstrap();
    const map = await createMap(campaignId, 'Monde', image(2000, 1000));
    const m = await saveMarker(campaignId, null, { mapId: map.id, label: 'Tour', x: 2500, y: -40, status: 'rumeur', radius: 100 });
    expect([m.x, m.y]).toEqual([2000, 0]);
    await saveMarker(campaignId, m.id, { mapId: map.id, x: 1000, y: 500 });
    await replaceMapImage(map.id, image(4000, 2000));
    const moved = (await db.markers.get(m.id))!;
    expect([moved.x, moved.y, moved.radius]).toEqual([2000, 1000, 200]);
    // L'ancienne image, devenue inutile, est effacée.
    expect(await db.mediaMeta.where('campaignId').equals(campaignId).count()).toBe(1);
  });

  it('se rendre dans un lieu le rend connu sur la carte', async () => {
    const { campaignId } = await bootstrap();
    const map = await createMap(campaignId, 'Monde', image(1000, 1000));
    const lisiere = (await listLocations(campaignId)).find((l) => l.name.startsWith('Lisière'))!;
    const m = await saveMarker(campaignId, null, { mapId: map.id, locationId: lisiere.id, x: 10, y: 10, status: 'cache' });
    await travelTo(campaignId, lisiere.id);
    expect((await db.markers.get(m.id))!.status).toBe('connu');
  });

  it('supprimer un lieu retire ses marqueurs ; supprimer une carte retire tout ce qui lui appartient', async () => {
    const { campaignId } = await bootstrap();
    const map = await createMap(campaignId, 'Monde', image(1000, 1000));
    const all = await listLocations(campaignId);
    const route = all.find((l) => l.name.startsWith('Route'))!;
    const lisiere = all.find((l) => l.parentId === route.id)!;
    await saveMarker(campaignId, null, { mapId: map.id, locationId: lisiere.id, x: 1, y: 1 });
    const free = await saveMarker(campaignId, null, { mapId: map.id, label: 'Ruines', x: 2, y: 2 });
    await deleteLocation(campaignId, route.id);
    expect((await db.markers.toArray()).map((m) => m.id)).toEqual([free.id]);

    await saveFogMask(map.id, 'data:image/png;base64,AAAA');
    await deleteMap(map.id);
    expect(await db.markers.count()).toBe(0);
    expect(await db.fogMasks.count()).toBe(0);
    expect((await db.campaigns.get(campaignId))!.currentMapId).toBeNull();
    expect(await db.mediaMeta.count()).toBe(0);
  });

  it('la sauvegarde transporte carte, marqueurs et brouillard', async () => {
    const { campaignId } = await bootstrap();
    const map = await createMap(campaignId, 'Monde', image(800, 600));
    await saveMarker(campaignId, null, { mapId: map.id, label: 'Gué', x: 100, y: 200, status: 'rumeur' });
    await saveFogMask(map.id, 'data:image/png;base64,QUJD');
    const { blob } = await exportCampaign(campaignId);
    await db.markers.clear();
    await db.fogMasks.clear();
    const preview = await readBackupFile(new File([blob], 'sauvegarde.zip'));
    await applyBackup(preview);
    expect((await db.markers.toArray())[0]).toMatchObject({ label: 'Gué', status: 'rumeur', x: 100 });
    expect((await db.fogMasks.toArray())[0].mask).toBe('data:image/png;base64,QUJD');
  });

  it('une rumeur ne trahit pas la position exacte mais la contient', () => {
    const m = { id: 'mrk_abc', x: 500, y: 500, radius: 100 };
    const c = rumorCenter(m);
    const d = Math.hypot(c.x - m.x, c.y - m.y);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(100);
    expect(rumorCenter(m)).toEqual(c);
  });
});
