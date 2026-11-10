/** État du stockage du navigateur (quota, persistance). */
export interface StorageInfo {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm) return { supported: false, usage: null, quota: null, persisted: null };
  const [estimate, persisted] = await Promise.all([
    sm.estimate ? sm.estimate().catch(() => undefined) : undefined,
    sm.persisted ? sm.persisted().catch(() => null) : null,
  ]);
  return {
    supported: true,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted,
  };
}

/**
 * Demande au navigateur de ne pas effacer les données en cas de manque d'espace.
 * Sur Chrome Android, accordé automatiquement pour une application installée.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Vérifie qu'il reste assez d'espace pour écrire `bytes` octets. */
export async function hasRoomFor(bytes: number): Promise<{ ok: boolean; available: number | null }> {
  const info = await getStorageInfo();
  if (info.usage == null || info.quota == null) return { ok: true, available: null };
  const available = info.quota - info.usage;
  return { ok: bytes < available * 0.9, available };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
}
