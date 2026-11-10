import { customAlphabet } from 'nanoid';

/**
 * Identifiants stables : un préfixe lisible + 16 caractères aléatoires (crypto).
 * Ex. `loc_k3j9x0q2m1v8a7b4`. Ils ne changent jamais, même si l'objet est renommé.
 */
const generate = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export const ID_PREFIXES = {
  campaign: 'cmp',
  location: 'loc',
  media: 'med',
  ambiance: 'amb',
  layer: 'lyr',
  map: 'map',
  marker: 'mrk',
  fog: 'fog',
  character: 'chr',
  item: 'itm',
  journal: 'jrn',
  roll: 'rol',
  stat: 'sta',
} as const;

export type EntityKind = keyof typeof ID_PREFIXES;

export function newId(kind: EntityKind): string {
  return `${ID_PREFIXES[kind]}_${generate()}`;
}
