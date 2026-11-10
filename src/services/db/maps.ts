import { db } from './database';
import { newId } from '@/domain/ids';
import { fogMaskSchema, mapSchema, markerSchema, type GameMap, type MapMarker } from '@/domain/schemas';
import { addMedia, deleteMediaIfUnused } from './media';

/** Résolution du masque de brouillard : largement suffisante pour un pinceau, et légère à enregistrer. */
export const FOG_MAX_EDGE = 1600;

export function fogSize(width: number, height: number): { width: number; height: number } {
  const s = Math.min(1, FOG_MAX_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

export interface MapImage {
  blob: Blob;
  width: number;
  height: number;
}

async function touch(campaignId: string, now = Date.now()) {
  await db.campaigns.update(campaignId, { updatedAt: now });
}

/** Crée une carte à partir d'une image ; elle devient la carte affichée. Le brouillard couvre tout. */
export async function createMap(campaignId: string, name: string, image: MapImage): Promise<GameMap> {
  const media = await addMedia(campaignId, image.blob, 'image', { width: image.width, height: image.height, name: `Carte — ${name}` });
  const now = Date.now();
  try {
    return await db.transaction('rw', db.maps, db.fogMasks, db.campaigns, async () => {
      const count = await db.maps.where('campaignId').equals(campaignId).count();
      const map = mapSchema.parse({
        id: newId('map'),
        campaignId,
        name: name.trim() || 'Carte',
        imageId: media.id,
        width: image.width,
        height: image.height,
        sortOrder: count,
        createdAt: now,
        updatedAt: now,
      });
      await db.maps.add(map);
      await db.fogMasks.add(
        fogMaskSchema.parse({ id: newId('fog'), campaignId, mapId: map.id, enabled: true, mask: '', ...fogSize(image.width, image.height), updatedAt: now }),
      );
      await db.campaigns.update(campaignId, { currentMapId: map.id, updatedAt: now });
      return map;
    });
  } catch (e) {
    await deleteMediaIfUnused(media.id);
    throw e;
  }
}

/**
 * Remplace l'image d'une carte (version plus détaillée, par exemple).
 * Les marqueurs suivent proportionnellement ; le brouillard, étiré sur la carte, aussi.
 */
export async function replaceMapImage(mapId: string, image: MapImage): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map) throw new Error('Cette carte n’existe plus.');
  const media = await addMedia(map.campaignId, image.blob, 'image', { width: image.width, height: image.height, name: `Carte — ${map.name}` });
  const sx = image.width / map.width;
  const sy = image.height / map.height;
  const now = Date.now();
  await db.transaction('rw', db.maps, db.markers, db.campaigns, async () => {
    await db.maps.update(mapId, { imageId: media.id, width: image.width, height: image.height, updatedAt: now });
    const markers = await db.markers.where('mapId').equals(mapId).toArray();
    for (const m of markers) await db.markers.update(m.id, { x: m.x * sx, y: m.y * sy, radius: m.radius * Math.max(sx, sy) });
    await touch(map.campaignId, now);
  });
  if (map.imageId) await deleteMediaIfUnused(map.imageId);
}

export async function renameMap(mapId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Le nom de la carte ne peut pas être vide.');
  const map = await db.maps.get(mapId);
  if (!map) return;
  await db.maps.update(mapId, { name: clean.slice(0, 200), updatedAt: Date.now() });
  await touch(map.campaignId);
}

export async function setCurrentMap(campaignId: string, mapId: string): Promise<void> {
  await db.campaigns.update(campaignId, { currentMapId: mapId });
}

/** Supprime une carte, ses marqueurs et son brouillard. Les lieux eux-mêmes sont conservés. */
export async function deleteMap(mapId: string): Promise<void> {
  const map = await db.maps.get(mapId);
  if (!map) return;
  await db.transaction('rw', db.maps, db.markers, db.fogMasks, db.campaigns, async () => {
    await db.markers.where('mapId').equals(mapId).delete();
    await db.fogMasks.where('mapId').equals(mapId).delete();
    await db.maps.delete(mapId);
    const campaign = await db.campaigns.get(map.campaignId);
    if (campaign?.currentMapId === mapId) {
      const next = await db.maps.where('campaignId').equals(map.campaignId).first();
      await db.campaigns.update(map.campaignId, { currentMapId: next?.id ?? null });
    }
    await touch(map.campaignId);
  });
  if (map.imageId) await deleteMediaIfUnused(map.imageId);
}

// ---------------------------------------------------------------------------
// Marqueurs
// ---------------------------------------------------------------------------

export type MarkerDraft = Pick<MapMarker, 'mapId' | 'locationId' | 'label' | 'note' | 'x' | 'y' | 'status' | 'radius'>;

export async function saveMarker(campaignId: string, id: string | null, draft: Partial<MarkerDraft> & { mapId: string }): Promise<MapMarker> {
  const now = Date.now();
  return db.transaction('rw', db.markers, db.maps, db.campaigns, async () => {
    const existing = id ? await db.markers.get(id) : undefined;
    if (id && !existing) throw new Error('Ce marqueur n’existe plus.');
    const map = await db.maps.get(draft.mapId);
    if (!map) throw new Error('Carte introuvable.');
    const row = markerSchema.parse({
      ...(existing ?? { id: newId('marker'), campaignId, createdAt: now }),
      ...draft,
      // Un marqueur reste toujours sur la carte.
      x: Math.min(map.width, Math.max(0, draft.x ?? existing?.x ?? 0)),
      y: Math.min(map.height, Math.max(0, draft.y ?? existing?.y ?? 0)),
      updatedAt: now,
    });
    await db.markers.put(row);
    await touch(campaignId, now);
    return row;
  });
}

export async function deleteMarker(id: string): Promise<void> {
  const m = await db.markers.get(id);
  if (!m) return;
  await db.markers.delete(id);
  await touch(m.campaignId);
}

// ---------------------------------------------------------------------------
// Brouillard
// ---------------------------------------------------------------------------

export async function saveFogMask(mapId: string, mask: string): Promise<void> {
  const fog = await db.fogMasks.where('mapId').equals(mapId).first();
  if (!fog) return;
  const now = Date.now();
  await db.fogMasks.update(fog.id, { mask, updatedAt: now });
  await touch(fog.campaignId, now);
}

export async function setFogEnabled(mapId: string, enabled: boolean): Promise<void> {
  const fog = await db.fogMasks.where('mapId').equals(mapId).first();
  if (!fog) return;
  await db.fogMasks.update(fog.id, { enabled, updatedAt: Date.now() });
  await touch(fog.campaignId);
}
