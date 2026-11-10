import { db } from './database';
import { newId } from '@/domain/ids';
import { allowedParents, canBeRoot, descendantIds } from '@/domain/locationTree';
import { locationSchema, type Location } from '@/domain/schemas';
import { deleteMediaIfUnused } from './media';

export function listLocations(campaignId: string): Promise<Location[]> {
  return db.locations.where('campaignId').equals(campaignId).toArray();
}

/** Remonte la hiérarchie : [région, zone, …, lieu]. */
export async function getLocationPath(locationId: string): Promise<Location[]> {
  const path: Location[] = [];
  let current = await db.locations.get(locationId);
  let guard = 0;
  while (current && guard < 16) {
    path.unshift(current);
    current = current.parentId ? await db.locations.get(current.parentId) : undefined;
    guard++;
  }
  return path;
}

export async function toggleFavorite(locationId: string): Promise<void> {
  const loc = await db.locations.get(locationId);
  if (!loc) return;
  await db.locations.update(locationId, { favorite: !loc.favorite, updatedAt: Date.now() });
}

export function sortLocations(list: Location[]): Location[] {
  return [...list].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  );
}

/** Champs modifiables depuis l'éditeur de lieu. */
export type LocationDraft = Pick<
  Location,
  'name' | 'kind' | 'parentId' | 'description' | 'theme' | 'imageId' | 'ambianceId'
>;

/**
 * Crée (id null) ou met à jour un lieu, après vérification de la hiérarchie.
 * Une illustration remplacée est supprimée si plus rien ne l'utilise.
 */
export async function saveLocation(campaignId: string, id: string | null, draft: LocationDraft): Promise<Location> {
  const now = Date.now();
  let previousImage: string | null = null;

  const saved = await db.transaction('rw', db.locations, db.campaigns, async () => {
    const all = await listLocations(campaignId);
    const existing = id ? all.find((l) => l.id === id) : undefined;
    if (id && !existing) throw new Error('Ce lieu n’existe plus.');

    if (draft.parentId) {
      if (!allowedParents(id, all).some((p) => p.id === draft.parentId)) {
        throw new Error('Ce lieu ne peut pas être placé ici (trois niveaux au maximum : région, zone, lieu).');
      }
    } else if (!canBeRoot(id, all)) {
      throw new Error('Ce lieu ne peut pas devenir une région.');
    }

    const siblings = all.filter((l) => l.parentId === draft.parentId && l.id !== id);
    const row = locationSchema.parse({
      ...(existing ?? {
        id: newId('location'),
        campaignId,
        favorite: false,
        lastVisitedAt: null,
        isDemo: false,
        createdAt: now,
        sortOrder: Math.max(0, ...siblings.map((s) => s.sortOrder + 1)),
      }),
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      updatedAt: now,
    });
    previousImage = existing?.imageId && existing.imageId !== row.imageId ? existing.imageId : null;
    await db.locations.put(row);
    await db.campaigns.update(campaignId, { updatedAt: now });
    return row;
  });

  if (previousImage) await deleteMediaIfUnused(previousImage);
  return saved;
}

/**
 * Supprime un lieu et tous ses sous-lieux. Si le lieu courant en fait partie,
 * le personnage est ramené au parent du lieu supprimé.
 */
export async function deleteLocation(campaignId: string, id: string): Promise<{ deleted: number }> {
  const images: string[] = [];
  const deleted = await db.transaction('rw', db.locations, db.campaigns, db.markers, async () => {
    const all = await listLocations(campaignId);
    const target = all.find((l) => l.id === id);
    if (!target) return 0;
    const ids = [id, ...descendantIds(id, all)];
    for (const l of all) if (ids.includes(l.id) && l.imageId) images.push(l.imageId);
    await db.locations.bulkDelete(ids);
    // Leurs marqueurs disparaissent de toutes les cartes.
    await db.markers.where('campaignId').equals(campaignId).filter((m) => !!m.locationId && ids.includes(m.locationId)).delete();
    const campaign = await db.campaigns.get(campaignId);
    const patch: { updatedAt: number; currentLocationId?: string | null } = { updatedAt: Date.now() };
    if (campaign?.currentLocationId && ids.includes(campaign.currentLocationId)) patch.currentLocationId = target.parentId;
    await db.campaigns.update(campaignId, patch);
    return ids.length;
  });
  for (const img of images) await deleteMediaIfUnused(img);
  return { deleted };
}
