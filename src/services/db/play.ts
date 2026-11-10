import { db } from './database';
import { newId } from '@/domain/ids';
import { guessCategory, parseItemInput } from '@/domain/quickEntry';
import type { RollResult } from '@/domain/dice';
import { luckCurrent, luckMax, type CheckResult } from '@/domain/checks';
import {
  characterSchema,
  diceRollSchema,
  itemSchema,
  journalEntrySchema,
  rulesSchema,
  traitSchema,
  type Character,
  type CharacterKind,
  type DiceRoll,
  type Item,
  type JournalEntry,
  type Rules,
  type Stat,
  type Trait,
} from '@/domain/schemas';
import { deleteMediaIfUnused } from './media';

/**
 * Données « de partie » : fiches, inventaire, journal, dés.
 * Contrairement au monde (lieux, cartes, ambiances), elles se modifient en mode Jeu.
 * Chaque suppression renvoie de quoi l'annuler.
 */

async function touch(campaignId: string, now = Date.now()) {
  await db.campaigns.update(campaignId, { updatedAt: now });
}

// ---------------------------------------------------------------------------
// Fiches
// ---------------------------------------------------------------------------

export async function createCharacter(campaignId: string, kind: CharacterKind, name: string): Promise<Character> {
  const now = Date.now();
  const count = await db.characters.where('campaignId').equals(campaignId).count();
  const row = characterSchema.parse({
    id: newId('character'),
    campaignId,
    kind,
    name: name.trim() || (kind === 'pj' ? 'Mon personnage' : 'Compagnon'),
    sortOrder: count,
    createdAt: now,
    updatedAt: now,
  });
  await db.characters.add(row);
  await touch(campaignId, now);
  return row;
}

export type CharacterPatch = Partial<Omit<Character, 'id' | 'campaignId' | 'createdAt'>>;

/**
 * Modifie une fiche en lisant sa DERNIÈRE version dans la même transaction que l'écriture.
 * Deux modifications rapprochées (deux touchers, une note enregistrée en différé, un autre
 * onglet) ne s'écrasent donc jamais. `patch` peut être une fonction de la fiche à jour :
 * c'est ainsi qu'on modifie un champ imbriqué (une compétence, un état) sans perdre les autres.
 * Renvoie la fiche enregistrée (undefined si elle n'existe plus ou si rien ne change).
 */
export async function patchCharacter(
  id: string,
  patch: CharacterPatch | ((c: Character) => CharacterPatch | undefined),
): Promise<Character | undefined> {
  let replacedPortrait: string | null = null;
  const saved = await db.transaction('rw', db.characters, db.campaigns, async () => {
    const c = await db.characters.get(id);
    if (!c) return undefined;
    const p = typeof patch === 'function' ? patch(c) : patch;
    if (!p) return undefined;
    const now = Date.now();
    const row = characterSchema.parse({ ...c, ...p, name: (p.name ?? c.name).trim(), updatedAt: now });
    await db.characters.put(row);
    await touch(c.campaignId, now);
    if (c.portraitId && c.portraitId !== row.portraitId) replacedPortrait = c.portraitId;
    return row;
  });
  // Hors transaction : la suppression d'un média lit d'autres tables.
  if (replacedPortrait) await deleteMediaIfUnused(replacedPortrait);
  return saved;
}

/** Remplace une fiche entière (restauration, import). Préférer `patchCharacter` pour une modification. */
export async function saveCharacter(c: Character): Promise<Character> {
  return (await patchCharacter(c.id, () => c)) ?? c;
}

/** Dégâts (négatif) ou soins (positif). Les PV ne dépassent pas le maximum. */
export async function adjustHp(id: string, delta: number): Promise<{ before: number; after: number } | undefined> {
  return db.transaction('rw', db.characters, db.campaigns, async () => {
    const c = await db.characters.get(id);
    if (!c) return undefined;
    const after = Math.max(-9999, Math.min(c.hpMax, c.hpCurrent + delta));
    await db.characters.update(id, { hpCurrent: after, updatedAt: Date.now() });
    await touch(c.campaignId);
    return { before: c.hpCurrent, after };
  });
}

/** Score de caractéristique : variation calculée sur la dernière valeur (touchers rapides cumulés). */
export function adjustAbility(id: string, abilityId: string, delta: number) {
  return patchCharacter(id, (c) => ({
    abilities: { ...c.abilities, [abilityId]: Math.max(1, Math.min(30, (c.abilities[abilityId] ?? 10) + delta)) },
  }));
}

/** Compétence : fusion avec la dernière valeur enregistrée (rang, bonus, favorite). */
export function patchSkill(id: string, skillId: string, p: Partial<{ rank: number; bonus: number; favorite: boolean }>) {
  return patchCharacter(id, (c) => {
    const prev = c.skills[skillId] ?? { rank: 0, bonus: 0, favorite: false };
    return { skills: { ...c.skills, [skillId]: { ...prev, ...p } } };
  });
}

/** Rang suivant (non formé → formé → expert → non formé), depuis la dernière valeur. */
export function cycleSkillRank(id: string, skillId: string) {
  return patchCharacter(id, (c) => {
    const prev = c.skills[skillId] ?? { rank: 0, bonus: 0, favorite: false };
    return { skills: { ...c.skills, [skillId]: { ...prev, rank: (prev.rank + 1) % 3 } } };
  });
}

export function toggleSkillFavorite(id: string, skillId: string) {
  return patchCharacter(id, (c) => {
    const prev = c.skills[skillId] ?? { rank: 0, bonus: 0, favorite: false };
    return { skills: { ...c.skills, [skillId]: { ...prev, favorite: !prev.favorite } } };
  });
}

export function addCondition(id: string, text: string) {
  const t = text.trim().slice(0, 60);
  return patchCharacter(id, (c) =>
    !t || c.conditions.some((x) => x.toLowerCase() === t.toLowerCase()) ? undefined : { conditions: [...c.conditions, t] },
  );
}

export function removeCondition(id: string, text: string) {
  return patchCharacter(id, (c) => ({ conditions: c.conditions.filter((x) => x !== text) }));
}

export function setCoin(id: string, coin: 'po' | 'pa' | 'pc', value: number) {
  return patchCharacter(id, (c) => ({ coins: { ...c.coins, [coin]: Math.max(0, Math.round(value) || 0) } }));
}

/** Valeur libre (niveau, défense…) : modifiée, ajoutée ou retirée par son identifiant. */
export function patchStat(id: string, statId: string, p: Partial<Stat> | null) {
  return patchCharacter(id, (c) => {
    if (p === null) return { stats: c.stats.filter((s) => s.id !== statId) };
    const exists = c.stats.some((s) => s.id === statId);
    return {
      stats: exists ? c.stats.map((s) => (s.id === statId ? { ...s, ...p } : s)) : [...c.stats, { id: statId, label: '', value: '', ...p }],
    };
  });
}

/** Supprime une fiche ; ses objets vont dans le sac commun. Renvoie de quoi annuler. */
export async function deleteCharacter(id: string): Promise<{ character: Character; itemIds: string[] } | undefined> {
  const res = await db.transaction('rw', db.characters, db.items, db.campaigns, async () => {
    const c = await db.characters.get(id);
    if (!c) return undefined;
    const items = await db.items.where('ownerId').equals(id).toArray();
    for (const it of items) await db.items.update(it.id, { ownerId: null });
    await db.characters.delete(id);
    await touch(c.campaignId);
    return { character: c, itemIds: items.map((i) => i.id) };
  });
  return res;
}

export async function restoreCharacter(saved: { character: Character; itemIds: string[] }): Promise<void> {
  await db.transaction('rw', db.characters, db.items, async () => {
    await db.characters.put(saved.character);
    for (const id of saved.itemIds) await db.items.update(id, { ownerId: saved.character.id });
  });
}

// ---------------------------------------------------------------------------
// Inventaire
// ---------------------------------------------------------------------------

export interface AddItemResult {
  item: Item;
  /** L'objet existait déjà chez ce porteur : la quantité a été augmentée. */
  merged: boolean;
  previousQuantity: number;
}

const sameName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0;

/**
 * Ajoute un objet. Un objet de même nom chez le même porteur est cumulé
 * (« 3 torches » de plus s'ajoutent aux torches déjà présentes).
 */
export async function addItem(
  campaignId: string,
  input: { name: string; quantity?: number; ownerId?: string | null; category?: Item['category']; foundAtId?: string | null; description?: string },
): Promise<AddItemResult> {
  const now = Date.now();
  const ownerId = input.ownerId ?? null;
  const quantity = Math.max(1, input.quantity ?? 1);
  return db.transaction('rw', db.items, db.campaigns, async () => {
    const existing = (await db.items.where('campaignId').equals(campaignId).toArray()).find(
      (i) => i.ownerId === ownerId && sameName(i.name, input.name.trim()),
    );
    if (existing) {
      const updated = { ...existing, quantity: existing.quantity + quantity, updatedAt: now };
      await db.items.put(updated);
      await touch(campaignId, now);
      return { item: updated, merged: true, previousQuantity: existing.quantity };
    }
    const item = itemSchema.parse({
      id: newId('item'),
      campaignId,
      ownerId,
      name: input.name.trim(),
      quantity,
      category: input.category ?? guessCategory(input.name),
      foundAtId: input.foundAtId ?? null,
      description: input.description ?? '',
      createdAt: now,
      updatedAt: now,
    });
    await db.items.add(item);
    await touch(campaignId, now);
    return { item, merged: false, previousQuantity: 0 };
  });
}

/** Saisie rapide : « 3 torches », « une vieille clé ». */
export function addItemFromText(campaignId: string, text: string, ownerId: string | null, foundAtId: string | null) {
  const { name, quantity } = parseItemInput(text);
  if (!name) throw new Error('Nom d’objet vide.');
  return addItem(campaignId, { name, quantity, ownerId, foundAtId });
}

export async function undoAddItem(r: AddItemResult): Promise<void> {
  if (r.merged) await db.items.update(r.item.id, { quantity: r.previousQuantity, updatedAt: Date.now() });
  else await db.items.delete(r.item.id);
}

export async function saveItem(item: Item): Promise<Item> {
  const now = Date.now();
  const row = itemSchema.parse({ ...item, name: item.name.trim(), updatedAt: now });
  await db.items.put(row);
  await touch(row.campaignId, now);
  return row;
}

export async function patchItem(id: string, patch: Partial<Omit<Item, 'id' | 'campaignId'>>): Promise<void> {
  await db.transaction('rw', db.items, db.campaigns, async () => {
    const it = await db.items.get(id);
    if (!it) return;
    const now = Date.now();
    await db.items.put(itemSchema.parse({ ...it, ...patch, name: (patch.name ?? it.name).trim(), updatedAt: now }));
    await touch(it.campaignId, now);
  });
}

/**
 * +1 / −1, calculé sur la dernière quantité enregistrée, dans une seule transaction :
 * deux touchers rapides comptent bien deux fois. À zéro, l'objet est retiré
 * (et l'ancienne ligne renvoyée pour pouvoir annuler).
 */
export async function changeQuantity(id: string, delta: number): Promise<{ removed?: Item } | undefined> {
  return db.transaction('rw', db.items, db.campaigns, async () => {
    const it = await db.items.get(id);
    if (!it) return undefined;
    const q = it.quantity + delta;
    if (q <= 0) {
      await db.items.delete(id);
      await touch(it.campaignId);
      return { removed: it };
    }
    await db.items.update(id, { quantity: q, updatedAt: Date.now() });
    await touch(it.campaignId);
    return {};
  });
}

export async function deleteItem(id: string): Promise<Item | undefined> {
  return db.transaction('rw', db.items, db.campaigns, async () => {
    const it = await db.items.get(id);
    if (!it) return undefined;
    await db.items.delete(id);
    await touch(it.campaignId);
    return it;
  });
}

export async function restoreRow<T extends 'items' | 'journal'>(table: T, row: T extends 'items' ? Item : JournalEntry): Promise<void> {
  if (table === 'items') await db.items.put(row as Item);
  else await db.journal.put(row as JournalEntry);
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export async function addJournalEntry(campaignId: string, partial: Partial<Omit<JournalEntry, 'id' | 'campaignId'>>): Promise<JournalEntry> {
  const now = Date.now();
  const row = journalEntrySchema.parse({ ...partial, id: newId('journal'), campaignId, createdAt: now, updatedAt: now });
  await db.journal.add(row);
  await touch(campaignId, now);
  return row;
}

/** Note rapide : la première ligne sert de titre. */
export function addQuickNote(campaignId: string, text: string, locationId: string | null): Promise<JournalEntry> {
  const clean = text.trim();
  const [first, ...rest] = clean.split('\n');
  const title = first.length > 80 && !rest.length ? '' : first.slice(0, 300);
  const body = title ? rest.join('\n').trim() : clean;
  return addJournalEntry(campaignId, { kind: 'note', title, body, locationId });
}

export async function saveJournalEntry(e: JournalEntry): Promise<JournalEntry> {
  const now = Date.now();
  const row = journalEntrySchema.parse({ ...e, updatedAt: now });
  await db.journal.put(row);
  await touch(row.campaignId, now);
  return row;
}

export async function deleteJournalEntry(id: string): Promise<JournalEntry | undefined> {
  const e = await db.journal.get(id);
  if (!e) return undefined;
  await db.journal.delete(id);
  await touch(e.campaignId);
  return e;
}

// ---------------------------------------------------------------------------
// Dés
// ---------------------------------------------------------------------------

export const DICE_HISTORY_LIMIT = 500;

/** Enregistre le lancer AVANT tout affichage : le résultat montré est celui conservé. */
export async function recordRoll(
  campaignId: string,
  result: RollResult | CheckResult,
  label = '',
  characterId: string | null = null,
): Promise<DiceRoll> {
  const row = rollRow(campaignId, result, label, characterId);
  await db.transaction('rw', db.diceRolls, () => insertRoll(row));
  return row;
}

function rollRow(campaignId: string, result: RollResult | CheckResult, label: string, characterId: string | null): DiceRoll {
  return diceRollSchema.parse({ id: newId('roll'), campaignId, label: label.trim().slice(0, 200), ...result, characterId, createdAt: Date.now() });
}

/** À appeler dans une transaction qui couvre `diceRolls`. */
async function insertRoll(row: DiceRoll) {
  await db.diceRolls.add(row);
  const all = await db.diceRolls.where('campaignId').equals(row.campaignId).sortBy('createdAt');
  if (all.length > DICE_HISTORY_LIMIT) await db.diceRolls.bulkDelete(all.slice(0, all.length - DICE_HISTORY_LIMIT).map((r) => r.id));
}

/**
 * Relance grâce à la chance : la dépense du point et l'enregistrement du nouveau jet forment
 * UNE seule opération. Si l'une échoue, rien n'est écrit ; si le dernier point vient d'être
 * dépensé ailleurs (double toucher, autre onglet), la relance est refusée.
 */
export async function recordLuckReroll(
  campaignId: string,
  characterId: string,
  rules: Rules,
  result: CheckResult,
  label: string,
): Promise<{ roll: DiceRoll; luckLeft: number }> {
  const row = rollRow(campaignId, result, label, characterId);
  return db.transaction('rw', db.characters, db.diceRolls, db.campaigns, async () => {
    const c = await db.characters.get(characterId);
    if (!c) throw new Error('Fiche introuvable.');
    const current = luckCurrent(c, rules);
    if (current <= 0) throw new Error('Plus aucun point de chance.');
    await db.characters.put(characterSchema.parse({ ...c, luckPoints: current - 1, updatedAt: Date.now() }));
    await insertRoll(row);
    await touch(campaignId);
    return { roll: row, luckLeft: current - 1 };
  });
}

export async function clearDiceHistory(campaignId: string): Promise<void> {
  await db.diceRolls.where('campaignId').equals(campaignId).delete();
}

// ---------------------------------------------------------------------------
// Chance : points limités. Aucune récupération automatique : c'est le MJ qui l'accorde.
// ---------------------------------------------------------------------------

/** Dépense d'un point, vérifiée sur la dernière valeur : on ne peut pas dépenser deux fois le dernier point. */
export async function spendLuck(characterId: string, rules: Rules): Promise<number | undefined> {
  const saved = await patchCharacter(characterId, (c) => {
    const current = luckCurrent(c, rules);
    if (current <= 0) throw new Error('Plus aucun point de chance.');
    return { luckPoints: current - 1 };
  });
  return saved?.luckPoints ?? undefined;
}

/** Récupération accordée par le MJ (« reprends un point de chance »), plafonnée au maximum. */
export async function recoverLuck(characterId: string, amount: number, rules: Rules): Promise<number | undefined> {
  const saved = await patchCharacter(characterId, (c) => ({
    luckPoints: Math.min(luckMax(c, rules), luckCurrent(c, rules) + Math.max(0, Math.round(amount))),
  }));
  return saved?.luckPoints ?? undefined;
}

// ---------------------------------------------------------------------------
// Traits, aptitudes, particularités : saisis à la main, jamais générés.
// ---------------------------------------------------------------------------

/** Brouillon de trait (validé à l'enregistrement, quand il a un nom). */
export function newTrait(partial: Partial<Trait>): Trait {
  return {
    id: newId('trait'),
    name: '',
    kindId: 'trait',
    stateId: 'actif',
    description: '',
    effects: [],
    uses: null,
    history: [],
    createdAt: Date.now(),
    ...partial,
  };
}

/** Toutes les opérations sur les traits partent de la dernière version de la fiche (même transaction). */
export async function saveTrait(characterId: string, trait: Trait): Promise<void> {
  const clean = traitSchema.parse(trait);
  await patchCharacter(characterId, (c) => ({
    traits: c.traits.some((t) => t.id === clean.id) ? c.traits.map((t) => (t.id === clean.id ? clean : t)) : [...c.traits, clean],
  }));
}

/** Change l'état d'un trait (latent → éveillé…) et garde la trace de cette évolution. */
export async function setTraitState(characterId: string, traitId: string, stateId: string, note = ''): Promise<void> {
  await patchCharacter(characterId, (c) => {
    const t = c.traits.find((x) => x.id === traitId);
    if (!t || t.stateId === stateId) return undefined;
    const history = [...t.history, { at: Date.now(), stateId, note: note.trim().slice(0, 500) }].slice(-100);
    return { traits: c.traits.map((x) => (x.id === traitId ? { ...t, stateId, history } : x)) };
  });
}

export async function adjustTraitUses(characterId: string, traitId: string, delta: number): Promise<void> {
  await patchCharacter(characterId, (c) => {
    const t = c.traits.find((x) => x.id === traitId);
    if (!t?.uses) return undefined;
    const current = Math.max(0, Math.min(t.uses.max, t.uses.current + delta));
    return { traits: c.traits.map((x) => (x.id === traitId ? { ...t, uses: { ...t.uses!, current } } : x)) };
  });
}

export async function deleteTrait(characterId: string, traitId: string): Promise<Trait | undefined> {
  let removed: Trait | undefined;
  await patchCharacter(characterId, (c) => {
    removed = c.traits.find((x) => x.id === traitId);
    return removed ? { traits: c.traits.filter((x) => x.id !== traitId) } : undefined;
  });
  return removed;
}

// ---------------------------------------------------------------------------
// Règles de la campagne (mode Préparation)
// ---------------------------------------------------------------------------

export async function saveRules(campaignId: string, rules: Rules): Promise<Rules> {
  const clean = rulesSchema.parse(rules);
  // Une compétence doit toujours pointer vers une caractéristique existante.
  const abilityIds = new Set(clean.abilities.map((a) => a.id));
  if (clean.skills.some((s) => !abilityIds.has(s.abilityId))) throw new Error('Une compétence est liée à une caractéristique supprimée.');
  if (new Set(clean.abilities.map((a) => a.id)).size !== clean.abilities.length) throw new Error('Deux caractéristiques ont le même identifiant.');
  await db.campaigns.update(campaignId, { rules: clean, updatedAt: Date.now() });
  return clean;
}
