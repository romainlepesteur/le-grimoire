import { db } from './database';
import { newId } from '@/domain/ids';
import type { MediaKind, MediaMeta } from '@/domain/schemas';
import { hasRoomFor, formatBytes } from '@/services/storage';

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  return (await db.mediaBlobs.get(id))?.blob;
}

/** Enregistre un fichier importé (image ou son) dans la base locale. */
export async function addMedia(
  campaignId: string,
  file: Blob & { name?: string },
  kind: MediaKind,
  extra: Partial<Pick<MediaMeta, 'width' | 'height' | 'duration' | 'name'>> = {},
): Promise<MediaMeta> {
  const room = await hasRoomFor(file.size);
  if (!room.ok) {
    throw new Error(
      `Espace insuffisant sur l’appareil (${formatBytes(room.available)} libres pour ${formatBytes(file.size)}).`,
    );
  }
  const meta: MediaMeta = {
    id: newId('media'),
    campaignId,
    kind,
    name: (extra.name ?? file.name ?? 'sans-nom').slice(0, 300),
    mime: file.type || 'application/octet-stream',
    size: file.size,
    width: extra.width ?? null,
    height: extra.height ?? null,
    duration: extra.duration ?? null,
    createdAt: Date.now(),
  };
  await db.transaction('rw', db.mediaMeta, db.mediaBlobs, db.campaigns, async () => {
    await db.mediaMeta.add(meta);
    await db.mediaBlobs.add({ id: meta.id, campaignId, blob: file });
    await db.campaigns.update(campaignId, { updatedAt: Date.now() });
  });
  return meta;
}

export async function renameMedia(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Le nom ne peut pas être vide.');
  await db.mediaMeta.update(id, { name: clean.slice(0, 300) });
}

export interface MediaUsage {
  locations: string[];
  ambiances: string[];
  maps: string[];
}

/** Qui utilise chaque média de la campagne (noms des lieux et ambiances). */
export async function mediaUsage(campaignId: string): Promise<Map<string, MediaUsage>> {
  const [locations, ambiances, maps] = await Promise.all([
    db.locations.where('campaignId').equals(campaignId).toArray(),
    db.ambiances.where('campaignId').equals(campaignId).toArray(),
    db.maps.where('campaignId').equals(campaignId).toArray(),
  ]);
  const usage = new Map<string, MediaUsage>();
  const get = (id: string) => {
    let u = usage.get(id);
    if (!u) usage.set(id, (u = { locations: [], ambiances: [], maps: [] }));
    return u;
  };
  for (const l of locations) if (l.imageId) get(l.imageId).locations.push(l.name);
  for (const a of ambiances) for (const layer of a.layers) get(layer.mediaId).ambiances.push(a.name);
  for (const m of maps) if (m.imageId) get(m.imageId).maps.push(m.name);
  return usage;
}

/** Supprime un média que plus rien n'utilise (après remplacement d'une illustration, par exemple). */
export async function deleteMediaIfUnused(id: string): Promise<boolean> {
  const meta = await db.mediaMeta.get(id);
  if (!meta) return false;
  const used = (await mediaUsage(meta.campaignId)).get(id);
  if (used && (used.locations.length || used.ambiances.length || used.maps.length)) return false;
  await db.transaction('rw', db.mediaMeta, db.mediaBlobs, async () => {
    await db.mediaMeta.delete(id);
    await db.mediaBlobs.delete(id);
  });
  return true;
}

/** Supprime un son et le retire des ambiances qui l'utilisent. */
export async function deleteSound(id: string): Promise<void> {
  const meta = await db.mediaMeta.get(id);
  if (!meta) return;
  const now = Date.now();
  await db.transaction('rw', db.mediaMeta, db.mediaBlobs, db.ambiances, db.campaigns, async () => {
    const ambiances = await db.ambiances.where('campaignId').equals(meta.campaignId).toArray();
    for (const a of ambiances) {
      if (a.layers.some((l) => l.mediaId === id)) {
        await db.ambiances.update(a.id, { layers: a.layers.filter((l) => l.mediaId !== id), updatedAt: now });
      }
    }
    await db.mediaMeta.delete(id);
    await db.mediaBlobs.delete(id);
    await db.campaigns.update(meta.campaignId, { updatedAt: now });
  });
}
