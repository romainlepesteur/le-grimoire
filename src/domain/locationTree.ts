import { MAX_LOCATION_DEPTH, type Location, type LocationKind } from './schemas';

/**
 * Règles de la hiérarchie des lieux (fonctions pures, testées).
 * Région › Ville ou zone › Lieu : au plus trois niveaux, sans cycle.
 */

type Node = Pick<Location, 'id' | 'parentId'>;

export function childrenMap<T extends Node>(list: T[]): Map<string | null, T[]> {
  const ids = new Set(list.map((l) => l.id));
  const m = new Map<string | null, T[]>();
  for (const l of list) {
    const parent = l.parentId && ids.has(l.parentId) ? l.parentId : null;
    m.set(parent, [...(m.get(parent) ?? []), l]);
  }
  return m;
}

/** Profondeur (0 = racine). */
export function depthOf(id: string, list: Node[]): number {
  const byId = new Map(list.map((l) => [l.id, l]));
  let depth = 0;
  let cur = byId.get(id);
  while (cur?.parentId && byId.has(cur.parentId) && depth < 32) {
    depth++;
    cur = byId.get(cur.parentId);
  }
  return depth;
}

/** Identifiants de tous les descendants (sans le lieu lui-même). */
export function descendantIds(id: string, list: Node[]): string[] {
  const children = childrenMap(list);
  const out: string[] = [];
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n.id);
    stack.push(...(children.get(n.id) ?? []));
  }
  return out;
}

/** Nombre de niveaux du sous-arbre (1 pour un lieu sans enfant). */
export function subtreeHeight(id: string, list: Node[]): number {
  const children = childrenMap(list);
  const h = (n: string, guard: number): number =>
    guard > 32 ? 1 : 1 + Math.max(0, ...(children.get(n) ?? []).map((c) => h(c.id, guard + 1)));
  return h(id, 0);
}

/**
 * Parents possibles pour un lieu (null = nouveau lieu) : ni lui-même, ni un de ses
 * descendants, et le sous-arbre déplacé doit tenir dans les trois niveaux.
 */
export function allowedParents<T extends Node>(selfId: string | null, list: T[]): T[] {
  const height = selfId ? subtreeHeight(selfId, list) : 1;
  const excluded = new Set(selfId ? [selfId, ...descendantIds(selfId, list)] : []);
  return list.filter((c) => !excluded.has(c.id) && depthOf(c.id, list) + 1 + height <= MAX_LOCATION_DEPTH);
}

/** Peut-on se passer de parent (devenir une région) ? */
export function canBeRoot(selfId: string | null, list: Node[]): boolean {
  return (selfId ? subtreeHeight(selfId, list) : 1) <= MAX_LOCATION_DEPTH;
}

/** Type proposé par défaut selon la position dans la hiérarchie. */
export function defaultKindForParent(parentId: string | null, list: Node[]): LocationKind {
  if (!parentId) return 'region';
  return depthOf(parentId, list) === 0 ? 'zone' : 'lieu';
}

/**
 * Ambiance effective d'un lieu : la sienne, sinon celle du parent le plus proche.
 * `path` va de la région au lieu.
 */
export function effectiveAmbiance(
  path: Pick<Location, 'id' | 'name' | 'ambianceId'>[],
): { ambianceId: string | null; inheritedFrom: string | null } {
  for (let i = path.length - 1; i >= 0; i--) {
    const l = path[i];
    if (l.ambianceId) return { ambianceId: l.ambianceId, inheritedFrom: i === path.length - 1 ? null : l.name };
  }
  return { ambianceId: null, inheritedFrom: null };
}
