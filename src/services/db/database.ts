import Dexie, { type EntityTable } from 'dexie';
import type { Ambiance, Campaign, FogMask, GameMap, GenericRow, Location, MapMarker, MediaMeta } from '@/domain/schemas';

export interface MediaBlobRow {
  id: string;
  campaignId: string;
  blob: Blob;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * Version du schéma IndexedDB. À chaque évolution de structure :
 * ajouter un `this.version(n+1).stores(...).upgrade(...)` ci-dessous,
 * ne jamais modifier une version déjà publiée.
 */
export const DB_SCHEMA_VERSION = 1;

/** Tables dont chaque ligne appartient à une campagne (hors binaires des médias). */
export const CAMPAIGN_TABLES = [
  'locations',
  'mediaMeta',
  'ambiances',
  'maps',
  'markers',
  'fogMasks',
  'characters',
  'items',
  'journal',
  'diceRolls',
] as const;
export type CampaignTableName = (typeof CAMPAIGN_TABLES)[number];

export class GrimoireDB extends Dexie {
  campaigns!: EntityTable<Campaign, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  mediaMeta!: EntityTable<MediaMeta, 'id'>;
  mediaBlobs!: EntityTable<MediaBlobRow, 'id'>;
  ambiances!: EntityTable<Ambiance, 'id'>;
  maps!: EntityTable<GameMap, 'id'>;
  markers!: EntityTable<MapMarker, 'id'>;
  fogMasks!: EntityTable<FogMask, 'id'>;
  characters!: EntityTable<GenericRow, 'id'>;
  items!: EntityTable<GenericRow, 'id'>;
  journal!: EntityTable<GenericRow, 'id'>;
  diceRolls!: EntityTable<GenericRow, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'le-grimoire') {
    super(name);
    this.version(1).stores({
      campaigns: 'id, updatedAt',
      locations: 'id, campaignId, parentId, lastVisitedAt',
      mediaMeta: 'id, campaignId, kind',
      mediaBlobs: 'id, campaignId',
      ambiances: 'id, campaignId',
      maps: 'id, campaignId',
      markers: 'id, campaignId, mapId',
      fogMasks: 'id, campaignId, mapId',
      characters: 'id, campaignId',
      items: 'id, campaignId, ownerId',
      journal: 'id, campaignId, createdAt',
      diceRolls: 'id, campaignId, createdAt',
      settings: 'key',
    });
  }
}

export const db = new GrimoireDB();
