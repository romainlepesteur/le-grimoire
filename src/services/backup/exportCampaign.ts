import { CAMPAIGN_TABLES, DB_SCHEMA_VERSION, db } from '@/services/db/database';
import {
  BACKUP_DATA_FILE,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupError,
  mediaPath,
  type Backup,
} from './format';
import { writeZip, type ZipInputEntry } from './zip';

export interface ExportResult {
  blob: Blob;
  filename: string;
  mediaCount: number;
  missingMedia: string[];
}

const README = `LE GRIMOIRE — SAUVEGARDE DE CAMPAGNE

Ce fichier ZIP contient une campagne complète :
- grimoire.json : lieux, ambiances, fiches, inventaire, journal, carte… (format JSON lisible)
- media/        : les images et sons importés (un fichier par média, nommé par son identifiant)

Pour restaurer : Le Grimoire → Réglages → Importer une sauvegarde (en mode Préparation).
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

  const entries: ZipInputEntry[] = [
    { name: BACKUP_DATA_FILE, data: new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }) },
    { name: 'LISEZMOI.txt', data: new Blob([README], { type: 'text/plain' }) },
  ];
  const missingMedia: string[] = [];
  for (const meta of tables.mediaMeta) {
    const blob = blobById.get(meta.id);
    if (blob) entries.push({ name: mediaPath(meta.id), data: blob });
    else missingMedia.push(meta.name || meta.id);
  }

  return {
    blob: await writeZip(entries),
    filename: `grimoire-${slug(campaign.name)}-${stamp(now)}.zip`,
    mediaCount: tables.mediaMeta.length - missingMedia.length,
    missingMedia,
  };
}
