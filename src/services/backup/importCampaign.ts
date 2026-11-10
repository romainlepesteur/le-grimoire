import { ZodError } from 'zod';
import type { Campaign } from '@/domain/schemas';
import { CAMPAIGN_TABLES, db, type MediaBlobRow } from '@/services/db/database';
import { hasRoomFor, formatBytes } from '@/services/storage';
import {
  BACKUP_DATA_FILE,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_MIGRATIONS,
  BackupError,
  backupSchema,
  mediaPath,
  type Backup,
} from './format';
import { checkIntegrity } from './integrity';
import { readZip, ZipFormatError, type ZipEntry } from './zip';

export interface ImportPreview {
  backup: Backup;
  /** Campagne déjà présente sur cet appareil avec le même identifiant. */
  existing: Campaign | undefined;
  counts: { locations: number; media: number; ambiances: number; characters: number; items: number; journal: number };
  mediaBytes: number;
  /** Contenu des médias, déjà vérifié (taille et somme de contrôle). */
  mediaBlobs: Map<string, Blob>;
  /** Références d'historique remises à vide pendant la vérification (à signaler). */
  corrections: string[];
}

function zodDetails(err: ZodError): string[] {
  return err.issues.slice(0, 6).map((i) => `${i.path.join(' › ') || 'racine'} : ${i.message}`);
}

/** Étape 1 : lire et valider le fichier, sans rien écrire. */
export async function readBackupFile(file: Blob): Promise<ImportPreview> {
  let entries: Map<string, ZipEntry>;
  try {
    entries = await readZip(file);
  } catch (e) {
    if (e instanceof ZipFormatError) throw new BackupError(e.message);
    throw e;
  }

  const dataEntry = entries.get(BACKUP_DATA_FILE);
  if (!dataEntry) {
    throw new BackupError(
      "Ce fichier n'est pas une sauvegarde du Grimoire (fichier grimoire.json absent).",
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await (await dataEntry.blob()).text());
  } catch {
    throw new BackupError('Le fichier grimoire.json est illisible ou endommagé.');
  }

  if (raw?.format !== BACKUP_FORMAT) {
    throw new BackupError("Ce fichier n'est pas une sauvegarde du Grimoire (format inconnu).");
  }
  let version = Number(raw.formatVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new BackupError('Version de sauvegarde invalide.');
  }
  if (version > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `Cette sauvegarde a été créée par une version plus récente du Grimoire (format ${version}). Mettez l'application à jour avant de l'importer.`,
    );
  }
  while (version < BACKUP_FORMAT_VERSION) {
    const migrate = BACKUP_MIGRATIONS[version];
    if (!migrate) throw new BackupError(`Aucune migration disponible depuis le format ${version}.`);
    raw = migrate(raw);
    version++;
    raw.formatVersion = version;
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BackupError('Les données de la sauvegarde sont invalides.', zodDetails(parsed.error));
  }
  const backup = parsed.data;
  const campaignId = backup.campaign.id;

  // Cohérence : toutes les lignes appartiennent bien à cette campagne.
  const problems: string[] = [];
  for (const name of CAMPAIGN_TABLES) {
    const rows = backup.tables[name] as { id: string; campaignId: string }[];
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.campaignId !== campaignId) problems.push(`${name} › ${row.id} : appartient à une autre campagne`);
      if (ids.has(row.id)) problems.push(`${name} › ${row.id} : identifiant en double`);
      ids.add(row.id);
    }
  }
  // Références entre éléments (lieux, cartes, médias, fiches, règles).
  const integrity = checkIntegrity(backup);
  problems.push(...integrity.errors);
  const checked = integrity.backup;

  // Chaque média décrit doit avoir son fichier, intact (taille et somme de contrôle vérifiées).
  const mediaBlobs = new Map<string, Blob>();
  let mediaBytes = 0;
  for (const meta of checked.tables.mediaMeta) {
    const entry = entries.get(mediaPath(meta.id));
    if (!entry) {
      problems.push(`média « ${meta.name} » : fichier absent de l'archive`);
      continue;
    }
    try {
      mediaBlobs.set(meta.id, await entry.blob(meta.mime));
      mediaBytes += entry.size;
    } catch (e) {
      problems.push(`média « ${meta.name} » : ${e instanceof ZipFormatError ? e.message : 'illisible'}`);
    }
  }
  if (problems.length) {
    throw new BackupError('La sauvegarde est incomplète ou incohérente.', problems.slice(0, 8));
  }

  return {
    backup: checked,
    existing: await db.campaigns.get(campaignId),
    counts: {
      locations: backup.tables.locations.length,
      media: backup.tables.mediaMeta.length,
      ambiances: backup.tables.ambiances.length,
      characters: backup.tables.characters.length,
      items: backup.tables.items.length,
      journal: backup.tables.journal.length,
    },
    mediaBytes,
    mediaBlobs,
    corrections: integrity.fixes,
  };
}

/**
 * Étape 2 : écrire la campagne. Si elle existe déjà sur l'appareil, elle est
 * remplacée intégralement, dans une seule transaction (tout ou rien).
 */
export async function applyBackup(preview: ImportPreview): Promise<string> {
  const { backup } = preview;
  const campaignId = backup.campaign.id;

  const room = await hasRoomFor(preview.mediaBytes);
  if (!room.ok) {
    throw new BackupError(
      `Espace de stockage insuffisant : ${formatBytes(preview.mediaBytes)} nécessaires, ${formatBytes(room.available)} disponibles.`,
    );
  }

  // Binaires déjà lus et vérifiés à l'étape 1 (une transaction IndexedDB ne doit attendre aucune autre opération).
  const blobRows: MediaBlobRow[] = backup.tables.mediaMeta.map((meta) => ({ id: meta.id, campaignId, blob: preview.mediaBlobs.get(meta.id)! }));

  const tables = [db.campaigns, db.mediaBlobs, ...CAMPAIGN_TABLES.map((n) => db.table(n))];
  await db.transaction('rw', tables, async () => {
    for (const name of CAMPAIGN_TABLES) {
      await db.table(name).where('campaignId').equals(campaignId).delete();
    }
    await db.mediaBlobs.where('campaignId').equals(campaignId).delete();
    await db.campaigns.put(backup.campaign);
    for (const name of CAMPAIGN_TABLES) {
      const rows = backup.tables[name];
      if (rows.length) await db.table(name).bulkAdd(rows);
    }
    if (blobRows.length) await db.mediaBlobs.bulkAdd(blobRows);
  });
  return campaignId;
}

/** Message compréhensible pour n'importe quelle erreur de sauvegarde/stockage. */
export function describeError(e: unknown): { message: string; details: string[] } {
  if (e instanceof BackupError) return { message: e.message, details: e.details };
  const name = (e as { name?: string })?.name ?? '';
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return {
      message: "Espace de stockage insuffisant sur l'appareil. Libérez de la place ou supprimez des médias volumineux.",
      details: [],
    };
  }
  return {
    message: "Une erreur inattendue s'est produite. Vos données existantes n'ont pas été modifiées.",
    details: [e instanceof Error ? e.message : String(e)],
  };
}
