import { describe, expect, it } from 'vitest';
import {
  allowedParents,
  canBeRoot,
  defaultKindForParent,
  depthOf,
  descendantIds,
  effectiveAmbiance,
  subtreeHeight,
} from './locationTree';
import { fitWithin } from '@/services/media/image';
import { soundNameFromFile, formatDuration } from '@/services/media/audio';
import { layerKeys, perceptual, randomBetween, type LayerSpec } from '@/services/audio/engine';

// Région R › Zone Z › Lieu L ; Région R2 seule ; Zone Z2 sous R sans enfant.
const tree = [
  { id: 'R', parentId: null },
  { id: 'Z', parentId: 'R' },
  { id: 'L', parentId: 'Z' },
  { id: 'R2', parentId: null },
  { id: 'Z2', parentId: 'R' },
];

describe('hiérarchie des lieux', () => {
  it('calcule profondeur, descendants et hauteur', () => {
    expect(depthOf('L', tree)).toBe(2);
    expect(depthOf('R', tree)).toBe(0);
    expect(descendantIds('R', tree).sort()).toEqual(['L', 'Z', 'Z2']);
    expect(subtreeHeight('R', tree)).toBe(3);
    expect(subtreeHeight('L', tree)).toBe(1);
  });

  it('interdit les cycles et les arbres de plus de trois niveaux', () => {
    // Un nouveau lieu peut aller sous une région ou une zone, pas sous un lieu (4e niveau).
    expect(allowedParents(null, tree).map((l) => l.id).sort()).toEqual(['R', 'R2', 'Z', 'Z2']);
    // Z (2 niveaux) ne peut aller que sous une région, et jamais sous lui-même ou son enfant.
    expect(allowedParents('Z', tree).map((l) => l.id).sort()).toEqual(['R', 'R2']);
    // R (3 niveaux) ne peut aller nulle part, mais peut rester une région.
    expect(allowedParents('R', tree)).toEqual([]);
    expect(canBeRoot('R', tree)).toBe(true);
  });

  it('propose le type selon le niveau', () => {
    expect(defaultKindForParent(null, tree)).toBe('region');
    expect(defaultKindForParent('R', tree)).toBe('zone');
    expect(defaultKindForParent('Z', tree)).toBe('lieu');
  });

  it('hérite de l’ambiance du parent le plus proche', () => {
    const path = [
      { id: 'R', name: 'Valdoren', ambianceId: 'a-region' },
      { id: 'Z', name: 'Ville', ambianceId: 'a-ville' },
      { id: 'L', name: 'Auberge', ambianceId: null },
    ];
    expect(effectiveAmbiance(path)).toEqual({ ambianceId: 'a-ville', inheritedFrom: 'Ville' });
    path[2].ambianceId = 'a-auberge';
    expect(effectiveAmbiance(path)).toEqual({ ambianceId: 'a-auberge', inheritedFrom: null });
    expect(effectiveAmbiance([{ id: 'X', name: 'X', ambianceId: null }])).toEqual({ ambianceId: null, inheritedFrom: null });
  });
});

describe('médias', () => {
  it('redimensionne en gardant les proportions', () => {
    expect(fitWithin(5120, 2880)).toEqual({ width: 2560, height: 1440 });
    expect(fitWithin(1080, 3000)).toEqual({ width: 922, height: 2560 });
    expect(fitWithin(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('tire un nom lisible du fichier son', () => {
    expect(soundNameFromFile('pluie_legere-loop.mp3')).toBe('Pluie legere loop');
    expect(soundNameFromFile('.ogg')).toBe('Son sans nom');
    expect(formatDuration(125.4)).toBe('2:05');
  });
});

describe('moteur audio (logique pure)', () => {
  const layer = (over: Partial<LayerSpec>): LayerSpec => ({
    id: 'l1',
    mediaId: 'm1',
    bus: 'sfx',
    volume: 1,
    loop: true,
    intervalMin: 10,
    intervalMax: 20,
    duration: 30,
    size: 1000,
    ...over,
  });

  it('une boucle partagée par deux ambiances garde la même clé (pas de coupure)', () => {
    const a = layerKeys({ id: 'A', layers: [layer({ id: 'x', mediaId: 'feu' })] });
    const b = layerKeys({ id: 'B', layers: [layer({ id: 'y', mediaId: 'feu' })] });
    expect(a).toEqual(b);
  });

  it('les sons ponctuels et les doublons ont des clés distinctes', () => {
    const keys = layerKeys({
      id: 'A',
      layers: [layer({ id: 'x', mediaId: 'feu' }), layer({ id: 'y', mediaId: 'feu' }), layer({ id: 'z', loop: false })],
    });
    expect(new Set(keys).size).toBe(3);
    expect(layerKeys({ id: 'B', layers: [layer({ id: 'z', loop: false })] })[0]).not.toBe(keys[2]);
  });

  it('courbe de volume perceptive et tirage borné', () => {
    expect(perceptual(0.5)).toBe(0.25);
    expect(perceptual(2)).toBe(1);
    expect(perceptual(-1)).toBe(0);
    expect(randomBetween(10, 20, () => 0)).toBe(10);
    expect(randomBetween(20, 10, () => 1)).toBe(20);
  });
});
