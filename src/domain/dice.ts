import type { DiceGroup, RollMode } from './schemas';

/**
 * Dés : tirage cryptographique uniforme et formules (« 2d6+1d4+3 »).
 * Fonctions pures (le générateur aléatoire est injectable pour les tests).
 */

export type Rng = (sides: number) => number;

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/**
 * Entier uniforme dans [1, sides] tiré de crypto.getRandomValues.
 * Échantillonnage par rejet : aucun biais de modulo, même pour un d100 ou un d7.
 */
export const secureRng: Rng = (sides) => {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return (buf[0] % sides) + 1;
  }
};

export interface DiceSpec {
  groups: { count: number; sides: number }[];
  modifier: number;
}

export class DiceFormulaError extends Error {}

/** Lit une formule : « d20 », « 2d6+3 », « 1d8 + 1d6 - 1 », « 3d6-2 ». */
export function parseFormula(input: string): DiceSpec {
  const text = input.toLowerCase().replace(/\s+/g, '').replace(/[×x]/g, '*');
  if (!text) throw new DiceFormulaError('Formule vide.');
  const terms = text.match(/[+-]?[^+-]+/g) ?? [];
  const groups: DiceSpec['groups'] = [];
  let modifier = 0;
  for (const raw of terms) {
    const sign = raw.startsWith('-') ? -1 : 1;
    const term = raw.replace(/^[+-]/, '');
    const dice = /^(\d*)d(\d+|%)$/.exec(term);
    if (dice) {
      if (sign < 0) throw new DiceFormulaError('Les dés soustraits ne sont pas pris en charge.');
      const count = dice[1] ? Number(dice[1]) : 1;
      const sides = dice[2] === '%' ? 100 : Number(dice[2]);
      if (count < 1 || count > MAX_DICE) throw new DiceFormulaError(`Entre 1 et ${MAX_DICE} dés par groupe.`);
      if (sides < 2 || sides > MAX_SIDES) throw new DiceFormulaError(`Un dé a entre 2 et ${MAX_SIDES} faces.`);
      const same = groups.find((g) => g.sides === sides);
      if (same) same.count = Math.min(MAX_DICE, same.count + count);
      else groups.push({ count, sides });
    } else if (/^\d+$/.test(term)) {
      modifier += sign * Number(term);
    } else {
      throw new DiceFormulaError(`« ${term} » n’est pas compris. Exemples : d20, 2d6+3, 1d8+1d6.`);
    }
  }
  if (!groups.length) throw new DiceFormulaError('Indiquez au moins un dé, par exemple 1d20.');
  if (Math.abs(modifier) > 9999) throw new DiceFormulaError('Modificateur trop grand.');
  return { groups, modifier };
}

export function formatFormula(spec: DiceSpec, mode: RollMode = 'normal'): string {
  const dice = spec.groups.map((g) => `${g.count}d${g.sides}`).join('+');
  const mod = spec.modifier ? (spec.modifier > 0 ? `+${spec.modifier}` : `${spec.modifier}`) : '';
  const suffix = mode === 'avantage' ? ' avec avantage' : mode === 'desavantage' ? ' avec désavantage' : '';
  return dice + mod + suffix;
}

/** L'avantage ne s'applique qu'à un dé unique (typiquement 1d20). */
export function supportsAdvantage(spec: DiceSpec): boolean {
  return spec.groups.length === 1 && spec.groups[0].count === 1;
}

export interface RollResult {
  formula: string;
  groups: DiceGroup[];
  modifier: number;
  total: number;
  mode: RollMode;
}

export function rollDice(spec: DiceSpec, mode: RollMode = 'normal', rng: Rng = secureRng): RollResult {
  const effective: RollMode = mode !== 'normal' && supportsAdvantage(spec) ? mode : 'normal';
  const groups: DiceGroup[] = spec.groups.map(({ count, sides }) => {
    if (effective !== 'normal') {
      const values = [rng(sides), rng(sides)];
      const pick = effective === 'avantage' ? (values[0] >= values[1] ? 0 : 1) : values[0] <= values[1] ? 0 : 1;
      return { sides, values, kept: [pick] };
    }
    return { sides, values: Array.from({ length: count }, () => rng(sides)) };
  });
  const sum = groups.reduce(
    (acc, g) => acc + (g.kept ? g.kept.reduce((a, i) => a + g.values[i], 0) : g.values.reduce((a, v) => a + v, 0)),
    0,
  );
  return { formula: formatFormula(spec, effective), groups, modifier: spec.modifier, total: sum + spec.modifier, mode: effective };
}

/** Un d20 naturel de 20 ou de 1 (une fois l'avantage appliqué). */
export function naturalD20(result: Pick<RollResult, 'groups'>): 'critique' | 'echec' | null {
  if (result.groups.length !== 1 || result.groups[0].sides !== 20) return null;
  const g = result.groups[0];
  const kept = g.kept ? g.kept.map((i) => g.values[i]) : g.values;
  if (kept.length !== 1) return null;
  return kept[0] === 20 ? 'critique' : kept[0] === 1 ? 'echec' : null;
}
