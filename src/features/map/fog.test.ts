import { describe, expect, it } from 'vitest';
import { markerShown } from './fog';

/** Régressions du 14 novembre : un lieu sous le brouillard ne doit rien dévoiler. */

const base = { spoilFree: true, fogActive: true, revealed: false, currentLocationId: null };
const known = { status: 'connu' as const, locationId: 'loc_ville' };

describe('lieux et brouillard', () => {
  it('mode Jeu : un lieu connu sous le brouillard n’apparaît pas', () => {
    expect(markerShown(known, base)).toBe(false);
  });

  it('il apparaît dès que sa zone est révélée', () => {
    expect(markerShown(known, { ...base, revealed: true })).toBe(true);
  });

  it('sans brouillard sur la carte, les lieux connus sont visibles', () => {
    expect(markerShown(known, { ...base, fogActive: false })).toBe(true);
  });

  it('la position du personnage reste visible, même dans le brouillard', () => {
    expect(markerShown(known, { ...base, currentLocationId: 'loc_ville' })).toBe(true);
  });

  it('une rumeur reste une zone approximative, même dans le brouillard', () => {
    expect(markerShown({ status: 'rumeur', locationId: 'loc_ville' }, base)).toBe(true);
  });

  it('un lieu caché n’apparaît jamais sans spoil, même révélé ou actuel', () => {
    const hidden = { status: 'cache' as const, locationId: 'loc_ville' };
    expect(markerShown(hidden, { ...base, revealed: true, currentLocationId: 'loc_ville' })).toBe(false);
  });

  it('Préparation, « voir sous le brouillard » : tout est affiché', () => {
    for (const status of ['cache', 'rumeur', 'connu'] as const) {
      expect(markerShown({ status, locationId: null }, { ...base, spoilFree: false })).toBe(true);
    }
  });
});
