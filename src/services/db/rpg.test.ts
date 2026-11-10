import { describe, expect, it } from 'vitest';
import { bootstrap } from '@/app/bootstrap';
import { rollCheck, skillParts } from '@/domain/checks';
import { rulesOf } from '@/domain/schemas';
import { exportCampaign } from '@/services/backup/exportCampaign';
import { applyBackup, readBackupFile } from '@/services/backup/importCampaign';
import { db } from './database';
import { createCharacter, newTrait, patchCharacter, recordRoll, recoverLuck, saveRules, saveTrait, setTraitState, spendLuck } from './play';

const rules = rulesOf(undefined);

describe('chance', () => {
  it('se dépense jusqu’à zéro et ne revient que sur décision manuelle, plafonnée', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'pj', 'Aldric');
    await patchCharacter(c.id, { abilities: { chance: 14 } }); // maximum 3
    expect(await spendLuck(c.id, rules)).toBe(2);
    expect(await spendLuck(c.id, rules)).toBe(1);
    expect(await spendLuck(c.id, rules)).toBe(0);
    await expect(spendLuck(c.id, rules)).rejects.toThrow(/Plus aucun/);
    expect((await db.characters.get(c.id))!.luckPoints).toBe(0);
    expect(await recoverLuck(c.id, 1, rules)).toBe(1);
    expect(await recoverLuck(c.id, 10, rules)).toBe(3);
  });
});

describe('traits', () => {
  it('un héritage latent évolue, et chaque étape est notée', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'pj', 'Aldric');
    const t = newTrait({
      name: 'Héritage des Valdoren',
      kindId: 'heritage',
      stateId: 'latent',
      description: 'Un ancien héritage familial, dont on ne sait presque rien.',
      effects: [{ id: 'eff_x', target: 'skill', targetId: 'arcanes', value: 2 }],
    });
    await saveTrait(c.id, t);
    let pj = (await db.characters.get(c.id))!;
    expect(rollCheck(rules, 'Arcanes', skillParts(pj, rules, 'arcanes'), {}, () => 10).total).toBe(10);

    await setTraitState(c.id, t.id, 'eveille', 'Une lueur au contact de l’autel');
    await setTraitState(c.id, t.id, 'actif');
    pj = (await db.characters.get(c.id))!;
    expect(pj.traits[0].history.map((h) => [h.stateId, h.note])).toEqual([
      ['eveille', 'Une lueur au contact de l’autel'],
      ['actif', ''],
    ]);
    expect(rollCheck(rules, 'Arcanes', skillParts(pj, rules, 'arcanes'), {}, () => 10).total).toBe(12);
  });
});

describe('règles et jets', () => {
  it('refuse une compétence liée à une caractéristique supprimée', async () => {
    const { campaignId } = await bootstrap();
    await expect(saveRules(campaignId, { ...rules, abilities: rules.abilities.filter((a) => a.id !== 'dex') })).rejects.toThrow(/supprimée/);
    const renamed = await saveRules(campaignId, { ...rules, skills: rules.skills.map((s) => (s.id === 'arcanes' ? { ...s, name: 'Savoir occulte' } : s)) });
    expect(rulesOf(await db.campaigns.get(campaignId)).skills.find((s) => s.id === 'arcanes')!.name).toBe('Savoir occulte');
    expect(renamed.skills.length).toBe(rules.skills.length);
  });

  it('l’historique garde le personnage, le détail et le verdict ; la sauvegarde transporte tout', async () => {
    const { campaignId } = await bootstrap();
    const c = await createCharacter(campaignId, 'compagnon', 'Brenna');
    await patchCharacter(c.id, { abilities: { sag: 16 }, skills: { perception: { rank: 2, bonus: 0, favorite: true } } });
    const pj = (await db.characters.get(c.id))!;
    const r = rollCheck(rules, 'Brenna — Perception', skillParts(pj, rules, 'perception'), { dc: 15 }, () => 8);
    const row = await recordRoll(campaignId, r, 'Perception', c.id);
    expect(row).toMatchObject({ characterId: c.id, total: 15, outcome: 'reussite', dc: 15 });
    expect(row.breakdown).toEqual([
      { label: 'Sagesse', value: 3 },
      { label: 'Expert', value: 4 },
    ]);

    await saveTrait(c.id, newTrait({ name: 'Pisteuse', kindId: 'aptitude', uses: { current: 1, max: 2 } }));
    const { blob } = await exportCampaign(campaignId);
    await db.characters.clear();
    await db.diceRolls.clear();
    await applyBackup(await readBackupFile(blob));
    const back = (await db.characters.get(c.id))!;
    expect(back.skills.perception).toEqual({ rank: 2, bonus: 0, favorite: true });
    expect(back.traits[0]).toMatchObject({ name: 'Pisteuse', uses: { current: 1, max: 2 } });
    expect((await db.diceRolls.toArray())[0].outcome).toBe('reussite');
  });
});

describe('fiches enregistrées avant les règles de jeu', () => {
  it('reçoivent les valeurs par défaut à la lecture et restent jouables', async () => {
    const { campaignId } = await bootstrap();
    const now = Date.now();
    // Fiche telle qu'enregistrée en phase 4 : sans caractéristiques, compétences, chance ni traits.
    const legacy = { id: 'chr_ancienne000000', campaignId, kind: 'pj', name: 'Aldric', concept: '', portraitId: null, hpCurrent: 7, hpMax: 10, stats: [], conditions: [], coins: { po: 3, pa: 0, pc: 0 }, status: 'present', relation: '', notes: '', sortOrder: 0, createdAt: now, updatedAt: now };
    await db.characters.add(legacy as never);
    await db.diceRolls.add({ id: 'rol_ancien00000000', campaignId, formula: '1d20', label: '', groups: [{ sides: 20, values: [4] }], modifier: 0, total: 4, mode: 'normal', createdAt: now } as never);
    const c = (await db.characters.get(legacy.id))!;
    expect(c).toMatchObject({ abilities: {}, skills: {}, luckPoints: null, traits: [], hpCurrent: 7 });
    expect(rollCheck(rules, 'Perception', skillParts(c, rules, 'perception'), {}, () => 9).total).toBe(9);
    expect((await db.diceRolls.get('rol_ancien00000000'))!.breakdown).toEqual([]);
  });
});
