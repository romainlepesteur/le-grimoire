import { db } from './database';

/** Réglages de l'application (propres à cet appareil, non exportés avec la campagne). */
export interface AppSettings {
  activeCampaignId: string | null;
  /** Empêche la mise en veille de l'écran pendant une session. */
  wakeLock: boolean;
  /** Date du dernier export de sauvegarde réussi (ms). */
  lastExportAt: number | null;
  /** L'avertissement « le navigateur n'est pas une sauvegarde » a été lu. */
  storageNoticeSeen: boolean;
  /** Effets d'ambiance sur les illustrations (poussières, lent mouvement de caméra). */
  ambientEffects: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeCampaignId: null,
  ambientEffects: true,
  wakeLock: true,
  lastExportAt: null,
  storageNoticeSeen: false,
};

const KEY = 'app';

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await getSettings()), ...patch };
    await db.settings.put({ key: KEY, value: next });
    return next;
  });
}
