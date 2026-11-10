import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { rollCheck } from '@/domain/checks';
import { rulesOf } from '@/domain/schemas';
import { db } from './database';
import { addMedia } from './media';
import {
  addCondition,
  addItemFromText,
  adjustAbility,
  changeQuantity,
  createCharacter,
  cycleSkillRank,
  patchCharacter,
  recordLuckReroll,
  spendLuck,
  toggleSkillFavorite,
} from './play';

/**
 * Régressions issues de la revue du 10 novembre : des écritures simultanées ne doivent
 * jamais s'écraser (deux touchers rapides, une note enregistrée en différé, deux onglets).
 */
const rules = rulesOf(undefined);

describe('écritures simultanées', () => {
  it('deux modifications de champs différents d’une fiche sont toutes deux conservées', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'pj', 'Aldric');
    await Promise.all([patchCharacter(c.id, { concept: 'Pisteur' }), patchCharacter(c.id, { notes: 'Le forgeron ment.' })]);
    expect(await db.characters.get(c.id)).toMatchObject({ concept: 'Pisteur', notes: 'Le forgeron ment.' });
  });

  it('les champs imbriqués (compétences, états, scores) se cumulent sans perte', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'pj', 'Aldric');
    await Promise.all([
      toggleSkillFavorite(c.id, 'perception'),
      cycleSkillRank(c.id, 'discretion'),
      cycleSkillRank(c.id, 'discretion'),
      addCondition(c.id, 'Empoisonné'),
      addCondition(c.id, 'Épuisé'),
      adjustAbility(c.id, 'dex', 1),
      adjustAbility(c.id, 'dex', 1),
      adjustAbility(c.id, 'dex', 1),
    ]);
    const saved = (await db.characters.get(c.id))!;
    expect(saved.skills.perception.favorite).toBe(true);
    expect(saved.skills.discretion.rank).toBe(2);
    expect(saved.conditions.sort()).toEqual(['Empoisonné', 'Épuisé']);
    expect(saved.abilities.dex).toBe(13);
  });

  it('deux augmentations rapides d’un objet comptent deux fois', async () => {
    const { campaignId } = await bootstrap();
    const { item } = await addItemFromText(campaignId, 'torche', null, null);
    await Promise.all([changeQuantity(item.id, 1), changeQuantity(item.id, 1)]);
    expect((await db.items.get(item.id))!.quantity).toBe(3);
  });

  it('le dernier point de chance ne peut être dépensé qu’une fois', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'pj', 'Aldric'); // Chance 10 → 1 point
    const results = await Promise.allSettled([spendLuck(c.id, rules), spendLuck(c.id, rules)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await db.characters.get(c.id))!.luckPoints).toBe(0);
  });

  it('relance par la chance : point dépensé et jet enregistré ensemble, ou rien du tout', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'pj', 'Aldric');
    const jet = rollCheck(rules, 'Aldric — Force', [{ label: 'Force', value: 0 }], {}, () => 12);
    const again = { ...jet, luckReroll: true };
    const [a, b] = await Promise.allSettled([
      recordLuckReroll(campaignId, c.id, rules, again, 'Force'),
      recordLuckReroll(campaignId, c.id, rules, again, 'Force'),
    ]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    // Un seul jet enregistré pour un seul point dépensé.
    expect(await db.diceRolls.count()).toBe(1);
    expect((await db.characters.get(c.id))!.luckPoints).toBe(0);
  });
});

describe('médias partagés', () => {
  it('un portrait encore utilisé par une autre fiche n’est pas effacé', async () => {
    const { campaignId } = await bootstrap();
    const portrait = await addMedia(campaignId, new Blob([new Uint8Array([1, 2])], { type: 'image/webp' }), 'image');
    const a = await createCharacter(campaignId, 'pj', 'Aldric');
    const b = await createCharacter(campaignId, 'compagnon', 'Brenna');
    await patchCharacter(a.id, { portraitId: portrait.id });
    await patchCharacter(b.id, { portraitId: portrait.id });
    await patchCharacter(a.id, { portraitId: null });
    expect(await db.mediaBlobs.get(portrait.id)).toBeDefined();
    await patchCharacter(b.id, { portraitId: null });
    expect(await db.mediaBlobs.get(portrait.id)).toBeUndefined();
  });
});
