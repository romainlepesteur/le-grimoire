import { CAMPAIGN_TABLES, DB_SCHEMA_VERSION, db } from '@/services/db/database';
import {
  BACKUP_DATA_FILE,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupError,
  mediaPath,
  type Backup,
} from './format';
import { describeError, readBackupFile } from './importCampaign';
import { writeZip, type ZipInputEntry } from './zip';

export interface ExportResult {
  blob: Blob;
  filename: string;
  mediaCount: number;
  /** Médias décrits mais dont le fichier manque sur l'appareil : retirés de l'archive. */
  missingMedia: string[];
  /** Vrai si des médias manquants ont été retirés : archive restaurable mais incomplète. */
  partial: boolean;
}

const README = `LE GRIMOIRE — SAUVEGARDE DE CAMPAGNE

Ce fichier ZIP contient une campagne complète :
- grimoire.json : lieux, ambiances, fiches, inventaire, journal, carte… (format JSON lisible)
- media/        : les images et sons importés (un fichier par média, nommé par son identifiant)

Pour restaurer ou installer : Le Grimoire → accueil « Vos campagnes » → Importer un pack.
Ne modifiez pas ce fichier à la main sauf si vous savez ce que vous faites.
`;

function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'campagne'
  );
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
}

/** Construit l'archive de sauvegarde complète d'une campagne (données + médias). */
export async function exportCampaign(campaignId: string): Promise<ExportResult> {
  const campaign = await db.campaigns.get(campaignId);
  if (!campaign) throw new BackupError('Campagne introuvable : rien à exporter.');

  const tables = {} as Backup['tables'];
  for (const name of CAMPAIGN_TABLES) {
    const rows = await db.table(name).where('campaignId').equals(campaignId).toArray();
    (tables as Record<string, unknown[]>)[name] = rows;
  }
  const blobs = await db.mediaBlobs.where('campaignId').equals(campaignId).toArray();
  const blobById = new Map(blobs.map((b) => [b.id, b.blob]));

  const now = new Date();
  const backup: Backup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: __APP_VERSION__,
    dbVersion: DB_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    campaign,
    tables,
  };

  // Un média dont le fichier a disparu de l'appareil ne peut pas être sauvegardé. Plutôt que de
  // produire une archive impossible à restaurer, on le retire avec ses références : l'export est
  // alors PARTIEL, mais restaurable, et clairement signalé comme tel.
  const missingIds = new Set(tables.mediaMeta.filter((m) => !blobById.has(m.id)).map((m) => m.id));
  const missingMedia = tables.mediaMeta.filter((m) => missingIds.has(m.id)).map((m) => m.name || m.id);
  if (missingIds.size) {
    const drop = (id: string | null) => (id && missingIds.has(id) ? null : id);
    tables.mediaMeta = tables.mediaMeta.filter((m) => !missingIds.has(m.id));
    backup.campaign = { ...campaign, coverId: drop(campaign.coverId) };
    tables.locations = tables.locations.map((l) => ({ ...l, imageId: drop(l.imageId) }));
    tables.maps = tables.maps.map((m) => ({ ...m, imageId: drop(m.imageId) }));
    tables.characters = tables.characters.map((c) => ({ ...c, portraitId: drop(c.portraitId) }));
    tables.ambiances = tables.ambiances.map((a) => ({ ...a, layers: a.layers.filter((l) => !missingIds.has(l.mediaId)) }));
  }

  const entries: ZipInputEntry[] = [
    { name: BACKUP_DATA_FILE, data: new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }) },
    { name: 'LISEZMOI.txt', data: new Blob([README], { type: 'text/plain' }) },
  ];
  for (const meta of tables.mediaMeta) entries.push({ name: mediaPath(meta.id), data: blobById.get(meta.id)! });
  const zip = await writeZip(entries);

  // Garantie : l'archive est relue et vérifiée comme à l'import, avant d'être proposée.
  try {
    await readBackupFile(zip);
  } catch (e) {
    const { message, details } = describeError(e);
    throw new BackupError(`L’archive produite ne passe pas la vérification : ${message}`, details);
  }

  return {
    blob: zip,
    filename: `grimoire-${slug(campaign.name)}-${stamp(now)}${missingIds.size ? '-partielle' : ''}.zip`,
    mediaCount: tables.mediaMeta.length,
    missingMedia,
    partial: missingIds.size > 0,
  };
}
