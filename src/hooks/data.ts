import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/services/db/database';
import { DEFAULT_SETTINGS, getSettings, type AppSettings } from '@/services/db/settings';
import { getLocationPath } from '@/services/db/locations';
import { useSession } from '@/stores/session';
import type { Campaign, Location } from '@/domain/schemas';

/** Réglages de l'appareil, mis à jour en direct. */
export function useSettings(): AppSettings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
}

/** Campagne active, mise à jour en direct. */
export function useActiveCampaign(): Campaign | undefined {
  const id = useSession((s) => s.campaignId);
  return useLiveQuery(() => (id ? db.campaigns.get(id) : undefined), [id]);
}

export function useCampaignLocations(campaignId: string | undefined): Location[] | undefined {
  return useLiveQuery(
    () => (campaignId ? db.locations.where('campaignId').equals(campaignId).toArray() : []),
    [campaignId],
  );
}

/** Lieu courant et son chemin hiérarchique (région › zone › lieu). */
export function useCurrentPlace(): { location: Location | undefined; path: Location[]; loading: boolean } {
  const campaign = useActiveCampaign();
  const locId = campaign?.currentLocationId ?? null;
  const path = useLiveQuery(() => (locId ? getLocationPath(locId) : Promise.resolve([])), [locId]);
  return {
    location: path?.[path.length - 1],
    path: path ?? [],
    loading: campaign === undefined || path === undefined,
  };
}
