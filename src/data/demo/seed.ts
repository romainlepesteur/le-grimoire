import { newId } from '@/domain/ids';
import { rulesSchema, type Campaign, type Location, type LocationKind, type PlaceholderTheme } from '@/domain/schemas';
import { db } from '@/services/db/database';

/**
 * Campagne D'EXEMPLE livrée avec l'application.
 * Toutes ces données portent `isDemo: true`. Elles ne contiennent ni secret de scénario
 * ni événement : seulement des lieux génériques pour essayer l'interface.
 */
interface DemoPlace {
  key: string;
  parent: string | null;
  kind: LocationKind;
  name: string;
  theme: PlaceholderTheme;
  description: string;
}

const PLACES: DemoPlace[] = [
  {
    key: 'region',
    parent: null,
    kind: 'region',
    name: 'Région de Valdoren',
    theme: 'region',
    description:
      'Exemple — Une région de collines douces et de forêts, traversée par les routes des caravanes.',
  },
  {
    key: 'ville',
    parent: 'region',
    kind: 'zone',
    name: 'Valdoren',
    theme: 'ville',
    description:
      'Exemple — Ville marchande où passent voyageurs et caravanes. Marchés, ateliers, auberges et quelques échoppes d’alchimie.',
  },
  {
    key: 'auberge',
    parent: 'ville',
    kind: 'lieu',
    name: 'Auberge du Cerf d’Argent',
    theme: 'auberge',
    description: 'Exemple — Une auberge de la ville : grande salle, cheminée, poutres apparentes.',
  },
  {
    key: 'marche',
    parent: 'ville',
    kind: 'lieu',
    name: 'Grand marché',
    theme: 'marche',
    description: 'Exemple — La place du marché, ses étals et ses marchands de passage.',
  },
  {
    key: 'route',
    parent: 'region',
    kind: 'zone',
    name: 'Route forestière de l’Est',
    theme: 'foret',
    description: 'Exemple — La route qui quitte Valdoren vers l’est en traversant la forêt.',
  },
  {
    key: 'lisiere',
    parent: 'route',
    kind: 'lieu',
    name: 'Lisière de la forêt',
    theme: 'foret',
    description: 'Exemple — L’endroit où la route s’enfonce sous les grands arbres.',
  },
  {
    key: 'collines',
    parent: 'region',
    kind: 'zone',
    name: 'Collines de Valdoren',
    theme: 'collines',
    description: 'Exemple — Les collines herbeuses qui entourent la ville.',
  },
  {
    key: 'sentier',
    parent: 'collines',
    kind: 'lieu',
    name: 'Sentier des crêtes',
    theme: 'collines',
    description: 'Exemple — Un sentier qui suit la ligne des collines.',
  },
];

export async function seedDemoCampaign(): Promise<string> {
  const now = Date.now();
  const campaignId = newId('campaign');
  const ids = new Map(PLACES.map((p) => [p.key, newId('location')]));

  const locations: Location[] = PLACES.map((p, i) => ({
    id: ids.get(p.key)!,
    campaignId,
    parentId: p.parent ? ids.get(p.parent)! : null,
    kind: p.kind,
    name: p.name,
    description: p.description,
    imageId: null,
    imageFocus: { x: 50, y: 50 },
    ambianceId: null,
    theme: p.theme,
    favorite: p.key === 'auberge',
    lastVisitedAt: p.key === 'auberge' ? now : null,
    sortOrder: i,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  }));

  const campaign: Campaign = {
    id: campaignId,
    name: 'Valdoren — campagne d’exemple',
    description:
      'Campagne de démonstration livrée avec Le Grimoire. Ses lieux sont des exemples, sans scénario ni secret.',
    isDemo: true,
    currentLocationId: ids.get('auberge')!,
    currentMapId: null,
    rules: rulesSchema.parse({}),
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', db.campaigns, db.locations, async () => {
    await db.campaigns.add(campaign);
    await db.locations.bulkAdd(locations);
  });
  return campaignId;
}
