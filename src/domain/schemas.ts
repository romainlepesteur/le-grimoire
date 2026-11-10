import { z } from 'zod';

/**
 * Modèles de données de la campagne.
 * Ces schémas servent à la fois de types TypeScript et de validation
 * (import de sauvegarde, données saisies). Ils sont la référence unique.
 */

const id = z.string().min(1).max(64);
const timestamp = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Campagne
// ---------------------------------------------------------------------------

export const campaignSchema = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  /** Campagne d'exemple livrée avec l'application. */
  isDemo: z.boolean().default(false),
  /** Lieu affiché sur l'écran Exploration. */
  currentLocationId: id.nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Campaign = z.infer<typeof campaignSchema>;

// ---------------------------------------------------------------------------
// Lieux : Région → Zone (ville, forêt…) → Lieu précis
// ---------------------------------------------------------------------------

export const LOCATION_KINDS = ['region', 'zone', 'lieu'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  region: 'Région',
  zone: 'Ville ou zone',
  lieu: 'Lieu',
};

/** Thème utilisé pour l'illustration provisoire tant qu'aucune image n'est importée. */
export const PLACEHOLDER_THEMES = [
  'region',
  'ville',
  'auberge',
  'marche',
  'foret',
  'collines',
  'montagne',
  'cote',
  'ruines',
  'donjon',
  'autre',
] as const;
export type PlaceholderTheme = (typeof PLACEHOLDER_THEMES)[number];

export const locationSchema = z.object({
  id,
  campaignId: id,
  parentId: id.nullable(),
  kind: z.enum(LOCATION_KINDS),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  imageId: id.nullable().default(null),
  ambianceId: id.nullable().default(null),
  theme: z.enum(PLACEHOLDER_THEMES).default('autre'),
  favorite: z.boolean().default(false),
  lastVisitedAt: timestamp.nullable().default(null),
  sortOrder: z.number().default(0),
  isDemo: z.boolean().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Location = z.infer<typeof locationSchema>;

// ---------------------------------------------------------------------------
// Médias (images, sons). Le contenu binaire est stocké à part (table mediaBlobs).
// ---------------------------------------------------------------------------

export const MEDIA_KINDS = ['image', 'audio'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const mediaMetaSchema = z.object({
  id,
  campaignId: id,
  kind: z.enum(MEDIA_KINDS),
  name: z.string().max(300),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  duration: z.number().nonnegative().nullable().default(null),
  createdAt: timestamp,
});
export type MediaMeta = z.infer<typeof mediaMetaSchema>;

// ---------------------------------------------------------------------------
// Ambiances sonores (utilisées en phase 2) : plusieurs couches simultanées.
// ---------------------------------------------------------------------------

export const AUDIO_BUSES = ['music', 'sfx'] as const;
export type AudioBus = (typeof AUDIO_BUSES)[number];

export const ambianceLayerSchema = z.object({
  id,
  mediaId: id,
  bus: z.enum(AUDIO_BUSES),
  volume: z.number().min(0).max(1).default(0.8),
  loop: z.boolean().default(true),
});
export type AmbianceLayer = z.infer<typeof ambianceLayerSchema>;

export const ambianceSchema = z.object({
  id,
  campaignId: id,
  name: z.string().trim().min(1).max(200),
  category: z.string().max(100).default('Exploration'),
  layers: z.array(ambianceLayerSchema).default([]),
  isDemo: z.boolean().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Ambiance = z.infer<typeof ambianceSchema>;

// ---------------------------------------------------------------------------
// Tables des phases suivantes (carte, fiches, inventaire, journal, dés).
// Leur structure détaillée sera fixée dans leur phase ; la sauvegarde
// les transporte déjà, avec une validation minimale.
// ---------------------------------------------------------------------------

export const genericRowSchema = z
  .object({
    id,
    campaignId: id,
  })
  .passthrough();
export type GenericRow = z.infer<typeof genericRowSchema>;
