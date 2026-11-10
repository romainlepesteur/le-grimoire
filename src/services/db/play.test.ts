import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { parseFormula, rollDice } from '@/domain/dice';
import { exportCampaign } from '@/services/backup/exportCampaign';
import { applyBackup, readBackupFile } from '@/services/backup/importCampaign';
import { diceHistoryToCsv, journalToMarkdown } from '@/services/export/journalExport';
import { db } from './database';
import {
  addItemFromText,
  addQuickNote,
  adjustHp,
  changeQuantity,
  createCharacter,
  deleteCharacter,
  DICE_HISTORY_LIMIT,
  recordRoll,
  restoreCharacter,
  undoAddItem,
} from './play';

describe('inventaire', () => {
  it('« ajoute une vieille clé » : en une phrase, avec catégorie et lieu de découverte', async () => {
    const { campaignId } = await bootstrap();
    const pj = await createCharacter(campaignId, 'pj', 'Aldric');
    const here = (await db.campaigns.get(campaignId))!.currentLocationId;
    const r = await addItemFromText(campaignId, 'une vieille clé', pj.id, here);
    expect(r.item).toMatchObject({ name: 'Vieille clé', quantity: 1, category: 'cle', ownerId: pj.id, foundAtId: here });
  });

  it('cumule un objet déjà porté, et l’annulation rétablit la quantité', async () => {
    const { campaignId } = await bootstrap();
    await addItemFromText(campaignId, '3 torches', null, null);
    const r = await addItemFromText(campaignId, '2 Torches', null, null);
    expect(r).toMatchObject({ merged: true, previousQuantity: 3 });
    expect(r.item.quantity).toBe(5);
    await undoAddItem(r);
    expect((await db.items.get(r.item.id))!.quantity).toBe(3);
    expect(await db.items.count()).toBe(1);
  });

  it('retire un objet arrivé à zéro', async () => {
    const { campaignId } = await bootstrap();
    const r = await addItemFromText(campaignId, 'potion de soin', null, null);
    const res = await changeQuantity(r.item.id, -1);
    expect(res?.removed?.name).toBe('Potion de soin');
    expect(await db.items.count()).toBe(0);
  });
});

describe('fiches', () => {
  it('les points de vie ne dépassent pas le maximum', async () => {
    const { campaignId } = await bootstrap();
    const pj = await createCharacter(campaignId, 'pj', 'Aldric');
    expect(await adjustHp(pj.id, -4)).toEqual({ before: 10, after: 6 });
    expect(await adjustHp(pj.id, +20)).toEqual({ before: 6, after: 10 });
  });

  it('supprimer un compagnon confie ses objets au sac commun ; annuler les lui rend', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'compagnon', 'Brenna');
    const { item } = await addItemFromText(campaignId, 'arc court', c.id, null);
    const saved = (await deleteCharacter(c.id))!;
    expect((await db.items.get(item.id))!.ownerId).toBeNull();
    await restoreCharacter(saved);
    expect((await db.items.get(item.id))!.ownerId).toBe(c.id);
    expect((await db.characters.get(c.id))!.name).toBe('Brenna');
  });
});

describe('journal et dés', () => {
  it('une note rapide prend sa première ligne pour titre et s’exporte en Markdown', async () => {
    const { campaignId } = await bootstrap();
    const e = await addQuickNote(campaignId, 'Le forgeron ment\nIl a parlé de la mine avant qu’on la mentionne.', null);
    expect(e).toMatchObject({ title: 'Le forgeron ment', body: 'Il a parlé de la mine avant qu’on la mentionne.' });
    const md = journalToMarkdown('Valdoren', [e], new Map());
    expect(md).toContain('## Le forgeron ment');
    expect(md).toContain('Il a parlé de la mine');
  });

  it('enregistre chaque lancer et borne l’historique', async () => {
    const { campaignId } = await bootstrap();
    const result = rollDice(parseFormula('d20+2'), 'avantage', () => 11);
    const saved = await recordRoll(campaignId, result, 'Attaque');
    expect(await db.diceRolls.get(saved.id)).toMatchObject({ total: 13, label: 'Attaque' });
    expect(diceHistoryToCsv([saved])).toContain('"Attaque";"1d20+2 avec avantage"');
    await db.diceRolls.bulkAdd(
      Array.from({ length: DICE_HISTORY_LIMIT + 5 }, (_, i) => ({ ...saved, id: `rol_${String(i).padStart(16, '0')}`, createdAt: i })),
    );
    await recordRoll(campaignId, result);
    expect(await db.diceRolls.count()).toBe(DICE_HISTORY_LIMIT);
  });

  it('la sauvegarde transporte fiches, objets, journal et dés', async () => {
    const { campaignId } = await bootstrap();
    const pj = await createCharacter(campaignId, 'pj', 'Aldric');
    await addItemFromText(campaignId, 'vieille clé', pj.id, null);
    await addQuickNote(campaignId, 'Rumeur de loups', null);
    await recordRoll(campaignId, rollDice(parseFormula('2d6'), 'normal', () => 3));
    const { blob } = await exportCampaign(campaignId);
    await Promise.all([db.characters.clear(), db.items.clear(), db.journal.clear(), db.diceRolls.clear()]);
    await applyBackup(await readBackupFile(blob));
    expect([await db.characters.count(), await db.items.count(), await db.journal.count(), await db.diceRolls.count()]).toEqual([1, 1, 1, 1]);
  });
});
