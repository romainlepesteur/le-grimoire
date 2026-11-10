import { db } from './database';
import { newId } from '@/domain/ids';
import { ambianceSchema, type Ambiance, type AmbianceLayer, type AudioBus } from '@/domain/schemas';

export async function createAmbiance(campaignId: string, name: string, category = 'Exploration'): Promise<Ambiance> {
  const now = Date.now();
  const row = ambianceSchema.parse({
    id: newId('ambiance'),
    campaignId,
    name: name.trim() || 'Nouvelle ambiance',
    category,
    layers: [],
    createdAt: now,
    updatedAt: now,
  });
  await db.transaction('rw', db.ambiances, db.campaigns, async () => {
    await db.ambiances.add(row);
    await db.campaigns.update(campaignId, { updatedAt: now });
  });
  return row;
}

/** Enregistre une ambiance complète après validation. */
export async function saveAmbiance(ambiance: Ambiance): Promise<Ambiance> {
  const now = Date.now();
  const row = ambianceSchema.parse({ ...ambiance, name: ambiance.name.trim(), updatedAt: now });
  await db.transaction('rw', db.ambiances, db.campaigns, async () => {
    await db.ambiances.put(row);
    await db.campaigns.update(row.campaignId, { updatedAt: now });
  });
  return row;
}

export function newLayer(mediaId: string, bus: AudioBus, loop = true): AmbianceLayer {
  return { id: newId('layer'), mediaId, bus, volume: bus === 'music' ? 0.7 : 0.8, loop, intervalMin: 20, intervalMax: 60 };
}

export async function duplicateAmbiance(id: string): Promise<Ambiance | undefined> {
  const src = await db.ambiances.get(id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: Ambiance = {
    ...src,
    id: newId('ambiance'),
    name: `${src.name} (copie)`.slice(0, 200),
    layers: src.layers.map((l) => ({ ...l, id: newId('layer') })),
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.ambiances.add(copy);
  return copy;
}

/** Supprime une ambiance ; les lieux qui l'utilisaient reprennent celle de leur parent. Les sons sont conservés. */
export async function deleteAmbiance(id: string): Promise<number> {
  return db.transaction('rw', db.ambiances, db.locations, db.campaigns, async () => {
    const amb = await db.ambiances.get(id);
    if (!amb) return 0;
    const users = await db.locations.where('campaignId').equals(amb.campaignId).filter((l) => l.ambianceId === id).toArray();
    const now = Date.now();
    for (const l of users) await db.locations.update(l.id, { ambianceId: null, updatedAt: now });
    await db.ambiances.delete(id);
    await db.campaigns.update(amb.campaignId, { updatedAt: now });
    return users.length;
  });
}
