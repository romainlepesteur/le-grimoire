import type { ItemCategory } from './schemas';

/**
 * Saisie rapide en langage naturel, pour noter en quelques secondes ce que le MJ annonce.
 *   « une vieille clé »      → Vieille clé ×1
 *   « 3 torches »            → Torches ×3
 *   « potion de soin x2 »    → Potion de soin ×2
 *   « 2x flèches »           → Flèches ×2
 */

// Un article est suivi d'une espace, ou d'une apostrophe pour « l' » et « de l' ».
const ARTICLES = /^(?:(?:une|un|des|du|de la|les|le|la)\s+|(?:de l|l)['’]\s*)/i;
const WORDS_NUM: Record<string, number> = {
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  douze: 12,
  vingt: 20,
};

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function parseItemInput(input: string): { name: string; quantity: number } {
  let text = input.trim().replace(/\s+/g, ' ');
  let quantity = 1;

  const tail = /^(.*\S)\s*(?:x|×)\s*(\d+)$/i.exec(text);
  const head = /^(\d+)\s*(?:x|×)?\s+(.+)$/i.exec(text) ?? /^(\d+)\s*(?:x|×)\s*(.+)$/i.exec(text);
  const word = /^(\S+)\s+(.+)$/.exec(text);
  if (tail) {
    text = tail[1];
    quantity = Number(tail[2]);
  } else if (head) {
    quantity = Number(head[1]);
    text = head[2];
  } else if (word && WORDS_NUM[word[1].toLowerCase()]) {
    quantity = WORDS_NUM[word[1].toLowerCase()];
    text = word[2];
  }
  text = text.replace(ARTICLES, '').trim();
  return { name: capitalize(text), quantity: Math.max(1, Math.min(999999, quantity || 1)) };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Mots-clés (sans accents) → catégorie. Le premier groupe qui correspond l'emporte. */
const RULES: [ItemCategory, string[]][] = [
  ['cle', ['cle', 'clef', 'clefs', 'cles', 'passe-partout']],
  ['potion', ['potion', 'potions', 'elixir', 'onguent', 'remede', 'baume', 'antidote', 'bandage', 'bandages', 'herbe', 'herbes', 'fiole']],
  ['magique', ['anneau', 'amulette', 'baguette', 'talisman', 'grimoire', 'runique', 'runiques', 'enchante', 'enchantee', 'magique', 'orbe', 'relique']],
  ['document', ['parchemin', 'parchemins', 'lettre', 'lettres', 'carte', 'cartes', 'livre', 'livres', 'journal', 'contrat', 'plan', 'plans', 'note', 'notes', 'missive', 'sceau']],
  ['arme', ['epee', 'dague', 'poignard', 'arc', 'arbalete', 'hache', 'lance', 'masse', 'marteau', 'fleche', 'fleches', 'carreau', 'carreaux', 'couteau', 'fronde', 'sabre', 'rapiere', 'gourdin', 'hallebarde']],
  ['armure', ['armure', 'bouclier', 'casque', 'cotte', 'cuirasse', 'gambison', 'jambieres', 'gantelets', 'cape', 'manteau', 'bottes', 'gants', 'tunique', 'robe', 'capuche']],
  ['vivres', ['pain', 'ration', 'rations', 'viande', 'fromage', 'vin', 'biere', 'eau', 'pomme', 'pommes', 'vivres', 'nourriture', 'hydromel', 'gourde']],
  ['tresor', ['gemme', 'gemmes', 'rubis', 'saphir', 'emeraude', 'diamant', 'perle', 'perles', 'bijou', 'bijoux', 'collier', 'lingot', 'pepite', 'calice', 'couronne']],
  ['outil', ['corde', 'torche', 'torches', 'lanterne', 'crochet', 'crochets', 'pelle', 'pioche', 'sac', 'couverture', 'silex', 'briquet', 'outil', 'outils', 'grappin', 'tente', 'miroir', 'boussole', 'chaine', 'cadenas']],
];

export function guessCategory(name: string): ItemCategory {
  const words = new Set(norm(name).split(/[^a-z-]+/).filter(Boolean));
  for (const [cat, keys] of RULES) if (keys.some((k) => words.has(k))) return cat;
  return 'divers';
}

/** Variation de points de vie : « -5 », « +3 », « 4 » (soin). */
export function parseHpDelta(input: string): number | null {
  const m = /^\s*([+-]?)\s*(\d{1,5})\s*$/.exec(input);
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * Number(m[2]);
}
