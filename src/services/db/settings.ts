import { db } from './database';

/** Réglages de l'application (propres à cet appareil, non exportés avec la campagne). */
export interface AppSettings {
  /** Dernière campagne ouverte (mise en avant sur l'accueil). */
  activeCampaignId: string | null;
  /** La campagne d'exemple a déjà été créée une fois : elle ne revient pas si on la supprime. */
  demoSeeded: boolean;
  /** Empêche la mise en veille de l'écran pendant une session. */
  wakeLock: boolean;
  /** Date du dernier export de sauvegarde réussi (ms). */
  lastExportAt: number | null;
  /** L'avertissement « le navigateur n'est pas une sauvegarde » a été lu. */
  storageNoticeSeen: boolean;
  /** Effets d'ambiance sur les illustrations (poussières, lent mouvement de caméra). */
  ambientEffects: boolean;
  /** Volumes audio (0 à 1) : général, musique, bruitages. */
  volumeMaster: number;
  volumeMusic: number;
  volumeSfx: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeCampaignId: null,
  demoSeeded: false,
  ambientEffects: true,
  volumeMaster: 0.8,
  volumeMusic: 0.7,
  volumeSfx: 0.9,
  muted: false,
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
