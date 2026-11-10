import { rollDice, secureRng, type RollResult, type Rng } from './dice';
import type { Character, DiceGroup, RollMode, Rules, Trait, TraitEffect } from './schemas';

/**
 * Jets de caractéristique et de compétence (fonctions pures).
 *
 *   Résultat = dé de résolution + modificateur de caractéristique
 *            + bonus de rang + bonus divers + effets des traits actifs + circonstance
 *
 * Chaque bonus est conservé avec son libellé : le détail du calcul est toujours affichable.
 */

export interface CheckPart {
  label: string;
  value: number;
}

export type CheckTarget = { kind: 'ability'; id: string } | { kind: 'skill'; id: string };

type Sheet = Pick<Character, 'abilities' | 'skills' | 'traits' | 'luckPoints'>;

/** Score 1–20 → modificateur : 10-11 → +0, 14 → +2, 8 → −1, 20 → +5. */
export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

export const scoreOf = (c: Sheet, abilityId: string) => c.abilities[abilityId] ?? 10;

/** « +2 », « −1 », « +0 » (vrai signe moins, plus lisible). */
export const formatMod = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export const RANK_LABELS = ['Non formé', 'Formé', 'Expert'] as const;

export function traitIsActive(trait: Trait, rules: Rules): boolean {
  return rules.traitStates.find((s) => s.id === trait.stateId)?.effects ?? false;
}

/** Effets mécaniques des traits actifs qui correspondent au filtre. */
function traitParts(c: Sheet, rules: Rules, match: (e: TraitEffect) => boolean): CheckPart[] {
  const out: CheckPart[] = [];
  for (const t of c.traits) {
    if (!traitIsActive(t, rules)) continue;
    for (const e of t.effects) if (e.value && match(e)) out.push({ label: t.name, value: e.value });
  }
  return out;
}

export function abilityParts(c: Sheet, rules: Rules, abilityId: string): CheckPart[] {
  const def = rules.abilities.find((a) => a.id === abilityId);
  return [
    { label: def?.name ?? 'Caractéristique', value: abilityMod(scoreOf(c, abilityId)) },
    ...traitParts(c, rules, (e) => (e.target === 'ability' && e.targetId === abilityId) || e.target === 'all_checks'),
  ];
}

export function skillParts(c: Sheet, rules: Rules, skillId: string): CheckPart[] {
  const def = rules.skills.find((s) => s.id === skillId);
  const abilityId = def?.abilityId ?? '';
  const ability = rules.abilities.find((a) => a.id === abilityId);
  const sk = c.skills[skillId] ?? { rank: 0, bonus: 0, favorite: false };
  const parts: CheckPart[] = [{ label: ability?.name ?? 'Caractéristique', value: abilityMod(scoreOf(c, abilityId)) }];
  if (sk.rank > 0) parts.push({ label: RANK_LABELS[sk.rank], value: rules.rankBonus[sk.rank - 1] });
  if (sk.bonus) parts.push({ label: 'Bonus divers', value: sk.bonus });
  parts.push(
    ...traitParts(
      c,
      rules,
      (e) => (e.target === 'skill' && e.targetId === skillId) || (e.target === 'ability' && e.targetId === abilityId) || e.target === 'all_checks',
    ),
  );
  return parts;
}

export function targetParts(c: Sheet, rules: Rules, target: CheckTarget): CheckPart[] {
  return target.kind === 'ability' ? abilityParts(c, rules, target.id) : skillParts(c, rules, target.id);
}

export function targetName(rules: Rules, target: CheckTarget): string {
  return target.kind === 'ability'
    ? (rules.abilities.find((a) => a.id === target.id)?.name ?? 'Caractéristique')
    : (rules.skills.find((s) => s.id === target.id)?.name ?? 'Compétence');
}

export const partsTotal = (parts: CheckPart[]) => parts.reduce((s, p) => s + p.value, 0);

/** Maximum de points de chance : 1 + modificateur de Chance (au moins 1) + effets de traits. */
export function luckMax(c: Sheet, rules: Rules): number {
  if (!rules.luck.enabled || !rules.abilities.some((a) => a.id === rules.luck.abilityId)) return 0;
  const base = Math.max(1, 1 + abilityMod(scoreOf(c, rules.luck.abilityId)));
  return Math.max(0, base + partsTotal(traitParts(c, rules, (e) => e.target === 'luck_max')));
}

/** Points restants (une fiche jamais entamée a tous ses points). */
export function luckCurrent(c: Sheet, rules: Rules): number {
  const max = luckMax(c, rules);
  return Math.min(max, c.luckPoints ?? max);
}

export interface CheckOptions {
  mode?: RollMode;
  /** Bonus ou malus de circonstance annoncé par le MJ. */
  circumstance?: number;
  /** Difficulté annoncée par le MJ (facultative). */
  dc?: number | null;
}

export interface CheckResult extends RollResult {
  breakdown: CheckPart[];
  dc: number | null;
  outcome: 'reussite' | 'echec' | null;
  luckReroll: boolean;
}

export function rollCheck(rules: Rules, label: string, parts: CheckPart[], opts: CheckOptions = {}, rng: Rng = secureRng): CheckResult {
  const breakdown = parts.filter((p, i) => i === 0 || p.value !== 0);
  if (opts.circumstance) breakdown.push({ label: 'Circonstance', value: opts.circumstance });
  const modifier = partsTotal(breakdown);
  const r = rollDice({ groups: [{ count: rules.die.count, sides: rules.die.sides }], modifier }, opts.mode ?? 'normal', rng);
  const dc = opts.dc ?? null;
  return {
    ...r,
    formula: `${label} : ${r.formula}`,
    breakdown,
    dc,
    outcome: dc == null ? null : r.total >= dc ? 'reussite' : 'echec',
    luckReroll: false,
  };
}

/**
 * Relance grâce à un point de chance : on relance les dés et on garde le meilleur des deux jets.
 * Les dés des deux jets sont conservés ; `kept` désigne ceux qui comptent.
 */
export function rerollWithLuck(previous: CheckResult, rules: Rules, opts: CheckOptions = {}, rng: Rng = secureRng): CheckResult {
  const again = rollDice(
    { groups: [{ count: rules.die.count, sides: rules.die.sides }], modifier: previous.modifier },
    opts.mode ?? previous.mode,
    rng,
  );
  const keepNew = again.total > previous.total;
  const groups: DiceGroup[] = previous.groups.map((g, i) => {
    const n = again.groups[i];
    const prevKept = g.kept ?? g.values.map((_, j) => j);
    const newKept = (n.kept ?? n.values.map((_, j) => j)).map((j) => j + g.values.length);
    return { sides: g.sides, values: [...g.values, ...n.values], kept: keepNew ? newKept : prevKept };
  });
  const total = Math.max(previous.total, again.total);
  return {
    ...previous,
    groups,
    total,
    formula: previous.formula.replace(/ — relance \(chance\)$/, '') + ' — relance (chance)',
    outcome: previous.dc == null ? null : total >= previous.dc ? 'reussite' : 'echec',
    luckReroll: true,
  };
}
