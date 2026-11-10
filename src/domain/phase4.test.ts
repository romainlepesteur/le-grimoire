import { describe, expect, it } from 'vitest';
import { formatFormula, naturalD20, parseFormula, rollDice, secureRng, supportsAdvantage } from './dice';
import { guessCategory, parseHpDelta, parseItemInput } from './quickEntry';

/** Générateur prévisible : renvoie les valeurs données, dans l'ordre. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('dés', () => {
  it('lit les formules courantes', () => {
    expect(parseFormula('d20')).toEqual({ groups: [{ count: 1, sides: 20 }], modifier: 0 });
    expect(parseFormula(' 2d6 + 3 ')).toEqual({ groups: [{ count: 2, sides: 6 }], modifier: 3 });
    expect(parseFormula('1d8+1d6-1')).toEqual({ groups: [{ count: 1, sides: 8 }, { count: 1, sides: 6 }], modifier: -1 });
    expect(parseFormula('d%')).toEqual({ groups: [{ count: 1, sides: 100 }], modifier: 0 });
    expect(parseFormula('1d6+1d6')).toEqual({ groups: [{ count: 2, sides: 6 }], modifier: 0 });
    expect(() => parseFormula('')).toThrow();
    expect(() => parseFormula('3+2')).toThrow(/au moins un dé/);
    expect(() => parseFormula('2d6+abc')).toThrow(/compris/);
    expect(() => parseFormula('500d6')).toThrow();
    expect(formatFormula(parseFormula('2d6-2'))).toBe('2d6-2');
  });

  it('calcule le total et applique avantage et désavantage', () => {
    expect(rollDice(parseFormula('2d6+3'), 'normal', seq(4, 5)).total).toBe(12);
    const adv = rollDice(parseFormula('d20+2'), 'avantage', seq(7, 15));
    expect(adv).toMatchObject({ total: 17, mode: 'avantage', formula: '1d20+2 avec avantage' });
    expect(adv.groups[0]).toEqual({ sides: 20, values: [7, 15], kept: [1] });
    expect(rollDice(parseFormula('d20'), 'desavantage', seq(7, 15)).total).toBe(7);
    // Pas d'avantage sur plusieurs dés : lancer normal.
    expect(supportsAdvantage(parseFormula('2d6'))).toBe(false);
    expect(rollDice(parseFormula('2d6'), 'avantage', seq(1, 2)).mode).toBe('normal');
  });

  it('repère les 20 et les 1 naturels', () => {
    expect(naturalD20(rollDice(parseFormula('d20+5'), 'normal', seq(20)))).toBe('critique');
    expect(naturalD20(rollDice(parseFormula('d20'), 'avantage', seq(1, 1)))).toBe('echec');
    expect(naturalD20(rollDice(parseFormula('d20'), 'avantage', seq(1, 20)))).toBe('critique');
    expect(naturalD20(rollDice(parseFormula('2d20'), 'normal', seq(20, 20)))).toBeNull();
  });

  it('tire uniformément chaque face (générateur cryptographique)', () => {
    const counts = new Array(7).fill(0);
    const n = 60000;
    for (let i = 0; i < n; i++) counts[secureRng(6)]++;
    expect(counts[0]).toBe(0);
    for (let f = 1; f <= 6; f++) expect(Math.abs(counts[f] / n - 1 / 6)).toBeLessThan(0.01);
    for (let i = 0; i < 2000; i++) {
      const v = secureRng(100);
      expect(v >= 1 && v <= 100 && Number.isInteger(v)).toBe(true);
    }
  });
});

describe('saisie rapide', () => {
  it('comprend les façons naturelles de dire un objet', () => {
    expect(parseItemInput('une vieille clé')).toEqual({ name: 'Vieille clé', quantity: 1 });
    expect(parseItemInput('3 torches')).toEqual({ name: 'Torches', quantity: 3 });
    expect(parseItemInput('potion de soin x2')).toEqual({ name: 'Potion de soin', quantity: 2 });
    expect(parseItemInput('2x flèches')).toEqual({ name: 'Flèches', quantity: 2 });
    expect(parseItemInput('trois pommes')).toEqual({ name: 'Pommes', quantity: 3 });
    expect(parseItemInput("l'amulette de Sorvan")).toEqual({ name: 'Amulette de Sorvan', quantity: 1 });
    expect(parseItemInput('Épée longue')).toEqual({ name: 'Épée longue', quantity: 1 });
  });

  it('devine la catégorie', () => {
    expect(guessCategory('Vieille clé')).toBe('cle');
    expect(guessCategory('Potion de soin')).toBe('potion');
    expect(guessCategory('Épée longue')).toBe('arme');
    expect(guessCategory('Carte du marais')).toBe('document');
    expect(guessCategory('Torches')).toBe('outil');
    expect(guessCategory('Rubis taillé')).toBe('tresor');
    expect(guessCategory('Porte-bonheur étrange')).toBe('divers');
  });

  it('lit une variation de points de vie', () => {
    expect(parseHpDelta('-5')).toBe(-5);
    expect(parseHpDelta('+ 3')).toBe(3);
    expect(parseHpDelta('4')).toBe(4);
    expect(parseHpDelta('abc')).toBeNull();
  });
});
