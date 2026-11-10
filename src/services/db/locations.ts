import { db } from './database';
import type { Location } from '@/domain/schemas';

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
