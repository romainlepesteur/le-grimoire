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
  /** Carte affichée sur l'écran Carte. */
  currentMapId: id.nullable().default(null),
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

export const THEME_LABELS: Record<PlaceholderTheme, string> = {
  region: 'Région, paysage',
  ville: 'Ville',
  auberge: 'Auberge, intérieur chaleureux',
  marche: 'Marché, place',
  foret: 'Forêt',
  collines: 'Collines, plaine',
  montagne: 'Montagne',
  cote: 'Côte, mer, lac',
  ruines: 'Ruines',
  donjon: 'Donjon, souterrain',
  autre: 'Autre',
};

/** Profondeur maximale de la hiérarchie : Région › Zone › Lieu. */
export const MAX_LOCATION_DEPTH = 3;

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
// Ambiances sonores : plusieurs couches simultanées (musique, fond sonore,
// sons ponctuels joués au hasard).
// ---------------------------------------------------------------------------

export const AUDIO_BUSES = ['music', 'sfx'] as const;
export type AudioBus = (typeof AUDIO_BUSES)[number];

export const AUDIO_BUS_LABELS: Record<AudioBus, string> = {
  music: 'Musique',
  sfx: 'Bruitages',
};

export const AMBIANCE_CATEGORIES = ['Exploration', 'Ville', 'Intérieur', 'Nature', 'Tension', 'Combat', 'Repos', 'Autre'];

export const ambianceLayerSchema = z.object({
  id,
  mediaId: id,
  bus: z.enum(AUDIO_BUSES),
  volume: z.number().min(0).max(1).default(0.8),
  /** true : boucle continue. false : son ponctuel rejoué au hasard (corbeau, cloche…). */
  loop: z.boolean().default(true),
  /** Intervalle (secondes) entre deux déclenchements d'un son ponctuel. */
  intervalMin: z.number().min(1).max(3600).default(20),
  intervalMax: z.number().min(1).max(3600).default(60),
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
// Cartes : une image, des marqueurs, un masque de brouillard.
// Coordonnées en pixels de l'image d'origine (x vers la droite, y vers le bas).
// ---------------------------------------------------------------------------

export const mapSchema = z.object({
  id,
  campaignId: id,
  name: z.string().trim().min(1).max(200),
  imageId: id.nullable().default(null),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sortOrder: z.number().default(0),
  isDemo: z.boolean().default(false),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type GameMap = z.infer<typeof mapSchema>;

/**
 * Ce que le joueur sait d'un lieu sur la carte :
 * - cache : invisible en mode Jeu (préparé à l'avance) ;
 * - rumeur : position approximative (une zone « quelque part par ici ») ;
 * - connu : position exacte.
 * C'est indépendant du brouillard : on peut connaître un lieu sans avoir exploré la région.
 */
export const MARKER_STATUSES = ['cache', 'rumeur', 'connu'] as const;
export type MarkerStatus = (typeof MARKER_STATUSES)[number];
export const MARKER_STATUS_LABELS: Record<MarkerStatus, string> = {
  cache: 'Caché au joueur',
  rumeur: 'Rumeur (position approximative)',
  connu: 'Connu (position exacte)',
};

export const markerSchema = z.object({
  id,
  campaignId: id,
  mapId: id,
  /** Lieu relié ; null pour un simple point d'intérêt. */
  locationId: id.nullable().default(null),
  label: z.string().max(200).default(''),
  note: z.string().max(2000).default(''),
  x: z.number().finite(),
  y: z.number().finite(),
  status: z.enum(MARKER_STATUSES).default('connu'),
  /** Rayon de la zone d'incertitude d'une rumeur (pixels de la carte). */
  radius: z.number().positive().max(100000).default(150),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type MapMarker = z.infer<typeof markerSchema>;

export const fogMaskSchema = z.object({
  id,
  campaignId: id,
  mapId: id,
  enabled: z.boolean().default(true),
  /** Image PNG (data URL) : opaque là où la carte est révélée. Vide = tout est dans le brouillard. */
  mask: z.string().max(20_000_000).default(''),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  updatedAt: timestamp,
});
export type FogMask = z.infer<typeof fogMaskSchema>;

// ---------------------------------------------------------------------------
// Tables des phases suivantes (fiches, inventaire, journal, dés).
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
