import { db } from './database';
import { newId } from '@/domain/ids';
import { guessCategory, parseItemInput } from '@/domain/quickEntry';
import type { RollResult } from '@/domain/dice';
import {
  characterSchema,
  diceRollSchema,
  itemSchema,
  journalEntrySchema,
  type Character,
  type CharacterKind,
  type DiceRoll,
  type Item,
  type JournalEntry,
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

export async function saveCharacter(c: Character): Promise<Character> {
  const now = Date.now();
  const row = characterSchema.parse({ ...c, name: c.name.trim(), updatedAt: now });
  const previous = await db.characters.get(c.id);
  await db.characters.put(row);
  await touch(c.campaignId, now);
  if (previous?.portraitId && previous.portraitId !== row.portraitId) await deleteMediaIfUnused(previous.portraitId);
  return row;
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

export async function patchCharacter(id: string, patch: Partial<Omit<Character, 'id' | 'campaignId'>>): Promise<void> {
  const c = await db.characters.get(id);
  if (!c) return;
  await saveCharacter({ ...c, ...patch });
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
  const it = await db.items.get(id);
  if (it) await saveItem({ ...it, ...patch });
}

/** +1 / −1. À zéro, l'objet est retiré (et l'ancienne ligne renvoyée pour annuler). */
export async function changeQuantity(id: string, delta: number): Promise<{ removed?: Item } | undefined> {
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
}

export async function deleteItem(id: string): Promise<Item | undefined> {
  const it = await db.items.get(id);
  if (!it) return undefined;
  await db.items.delete(id);
  await touch(it.campaignId);
  return it;
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
export async function recordRoll(campaignId: string, result: RollResult, label = ''): Promise<DiceRoll> {
  const row = diceRollSchema.parse({ id: newId('roll'), campaignId, label: label.trim().slice(0, 200), ...result, createdAt: Date.now() });
  await db.transaction('rw', db.diceRolls, async () => {
    await db.diceRolls.add(row);
    const all = await db.diceRolls.where('campaignId').equals(campaignId).sortBy('createdAt');
    if (all.length > DICE_HISTORY_LIMIT) await db.diceRolls.bulkDelete(all.slice(0, all.length - DICE_HISTORY_LIMIT).map((r) => r.id));
  });
  return row;
}

export async function clearDiceHistory(campaignId: string): Promise<void> {
  await db.diceRolls.where('campaignId').equals(campaignId).delete();
}
