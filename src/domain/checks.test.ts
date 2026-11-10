import { describe, expect, it } from 'vitest';
import {
  abilityMod,
  abilityParts,
  formatMod,
  luckCurrent,
  luckMax,
  partsTotal,
  rerollWithLuck,
  rollCheck,
  skillParts,
} from './checks';
import { rulesOf, type Trait } from './schemas';

const rules = rulesOf(undefined);
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};
const trait = (over: Partial<Trait>): Trait => ({
  id: 'trt_1',
  name: 'Héritage',
  kindId: 'heritage',
  stateId: 'latent',
  description: '',
  effects: [],
  uses: null,
  history: [],
  createdAt: 0,
  ...over,
});
const sheet = (over: Partial<{ abilities: Record<string, number>; skills: Record<string, { rank: number; bonus: number; favorite: boolean }>; traits: Trait[]; luckPoints: number | null }> = {}) => ({
  abilities: {},
  skills: {},
  traits: [],
  luckPoints: null,
  ...over,
});

describe('caractéristiques et compétences', () => {
  it('calcule les modificateurs classiques', () => {
    expect([1, 8, 9, 10, 11, 12, 14, 18, 20].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 2, 4, 5]);
    expect(formatMod(2)).toBe('+2');
    expect(formatMod(-1)).toBe('−1');
    expect(formatMod(0)).toBe('+0');
  });

  it('additionne caractéristique, rang et bonus divers', () => {
    const c = sheet({ abilities: { dex: 14 }, skills: { discretion: { rank: 1, bonus: 1, favorite: false } } });
    const parts = skillParts(c, rules, 'discretion');
    expect(parts).toEqual([
      { label: 'Dextérité', value: 2 },
      { label: 'Formé', value: 2 },
      { label: 'Bonus divers', value: 1 },
    ]);
    expect(partsTotal(skillParts(sheet({ skills: { arcanes: { rank: 2, bonus: 0, favorite: false } } }), rules, 'arcanes'))).toBe(4);
    // Une fiche sans valeurs : scores de 10, modificateur +0.
    expect(partsTotal(abilityParts(sheet(), rules, 'for'))).toBe(0);
  });

  it('un trait latent n’a aucun effet ; actif, ses effets s’appliquent', () => {
    const effects = [
      { id: 'eff_1', target: 'skill' as const, targetId: 'arcanes', value: 2 },
      { id: 'eff_2', target: 'all_checks' as const, targetId: null, value: 1 },
    ];
    const latent = sheet({ traits: [trait({ stateId: 'latent', effects })] });
    expect(partsTotal(skillParts(latent, rules, 'arcanes'))).toBe(0);
    const actif = sheet({ traits: [trait({ stateId: 'actif', effects })] });
    expect(partsTotal(skillParts(actif, rules, 'arcanes'))).toBe(3);
    expect(partsTotal(skillParts(actif, rules, 'perception'))).toBe(1);
  });
});

describe('jets', () => {
  it('ajoute les bonus au dé, avec circonstance et difficulté', () => {
    const c = sheet({ abilities: { sag: 14 }, skills: { perception: { rank: 1, bonus: 0, favorite: true } } });
    const r = rollCheck(rules, 'Perception', skillParts(c, rules, 'perception'), { circumstance: -2, dc: 15 }, seq(12));
    expect(r.total).toBe(12 + 2 + 2 - 2);
    expect(r.outcome).toBe('echec');
    expect(r.breakdown.at(-1)).toEqual({ label: 'Circonstance', value: -2 });
    expect(r.formula).toBe('Perception : 1d20+2');
    expect(rollCheck(rules, 'Force', abilityParts(sheet(), rules, 'for'), { dc: 10 }, seq(10)).outcome).toBe('reussite');
  });

  it('la relance par la chance garde le meilleur des deux jets', () => {
    const first = rollCheck(rules, 'Discrétion', [{ label: 'Dextérité', value: 3 }], { dc: 15 }, seq(5));
    expect(first.outcome).toBe('echec');
    const better = rerollWithLuck(first, rules, {}, seq(16));
    expect(better).toMatchObject({ total: 19, outcome: 'reussite', luckReroll: true });
    expect(better.groups[0]).toEqual({ sides: 20, values: [5, 16], kept: [1] });
    const worse = rerollWithLuck(first, rules, {}, seq(2));
    expect(worse.total).toBe(8);
    expect(worse.groups[0].kept).toEqual([0]);
  });
});

describe('chance', () => {
  it('points limités, calculés depuis la Chance, jamais rechargés tout seuls', () => {
    expect(luckMax(sheet(), rules)).toBe(1);
    expect(luckMax(sheet({ abilities: { chance: 16 } }), rules)).toBe(4);
    expect(luckMax(sheet({ abilities: { chance: 6 } }), rules)).toBe(1);
    expect(luckCurrent(sheet({ abilities: { chance: 16 } }), rules)).toBe(4);
    expect(luckCurrent(sheet({ abilities: { chance: 16 }, luckPoints: 1 }), rules)).toBe(1);
    expect(luckCurrent(sheet({ abilities: { chance: 10 }, luckPoints: 3 }), rules)).toBe(1);
    expect(luckMax(sheet(), { ...rules, luck: { enabled: false, abilityId: 'chance' } })).toBe(0);
  });
});
