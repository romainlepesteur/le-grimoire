import { z } from 'zod';
import {
  ambianceSchema,
  campaignSchema,
  characterSchema,
  diceRollSchema,
  fogMaskSchema,
  itemSchema,
  journalEntrySchema,
  locationSchema,
  mapSchema,
  markerSchema,
  mediaMetaSchema,
} from '@/domain/schemas';

/**
 * Format d'une sauvegarde (.zip) :
 *   grimoire.json      → données de la campagne (ce schéma)
 *   media/<id-média>   → fichiers binaires des images et sons
 *   LISEZMOI.txt       → explication lisible par un humain
 */
export const BACKUP_FORMAT = 'le-grimoire-sauvegarde';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_DATA_FILE = 'grimoire.json';
export const mediaPath = (mediaId: string) => `media/${mediaId}`;

/** Plafond par table : très au-delà d'une vraie campagne, il borne le travail de validation. */
const MAX_ROWS = 100_000;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  appVersion: z.string(),
  dbVersion: z.number().int().positive(),
  exportedAt: z.string(),
  campaign: campaignSchema,
  tables: z.object({
    locations: z.array(locationSchema).max(MAX_ROWS).default([]),
    mediaMeta: z.array(mediaMetaSchema).max(MAX_ROWS).default([]),
    ambiances: z.array(ambianceSchema).max(MAX_ROWS).default([]),
    maps: z.array(mapSchema).max(MAX_ROWS).default([]),
    markers: z.array(markerSchema).max(MAX_ROWS).default([]),
    fogMasks: z.array(fogMaskSchema).max(MAX_ROWS).default([]),
    characters: z.array(characterSchema).max(MAX_ROWS).default([]),
    items: z.array(itemSchema).max(MAX_ROWS).default([]),
    journal: z.array(journalEntrySchema).max(MAX_ROWS).default([]),
    diceRolls: z.array(diceRollSchema).max(MAX_ROWS).default([]),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

/**
 * Migrations du format de sauvegarde : une fonction par version, qui transforme
 * les données de la version N vers N+1. Vide tant que le format n'a pas évolué.
 */
export const BACKUP_MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

/** Erreur destinée à être montrée telle quelle à l'utilisateur. */
export class BackupError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'BackupError';
  }
}
