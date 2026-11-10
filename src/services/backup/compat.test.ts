import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { rulesOf } from '@/domain/schemas';
import { db } from '@/services/db/database';
import { getMediaBlob } from '@/services/db/media';
import { applyBackup, readBackupFile } from './importCampaign';
import { readZip } from './zip';

/**
 * Compatibilité des sauvegardes : des fichiers produits par une version de référence
 * (Zod 3, phase 3) doivent être relus à l'identique par la version actuelle.
 */
const DIR = 'src/services/backup/__fixtures__';
const load = (name: string) => new Blob([readFileSync(`${DIR}/${name}`)]);
const expected = JSON.parse(readFileSync(`${DIR}/attendu-v1.json`, 'utf8'));

describe('compatibilité des sauvegardes existantes', () => {
  beforeEach(() => db.open());

  for (const [label, file] of [
    ['actuelle', 'sauvegarde-v1.zip'],
    ['ancienne', 'sauvegarde-v1-ancienne.zip'],
  ] as const) {
    it(`relit la sauvegarde ${label} exactement comme la version de référence`, async () => {
      const preview = await readBackupFile(load(file));
      const actual = JSON.parse(JSON.stringify(preview.backup));
      // Seul ajout depuis la référence : les règles de jeu par défaut, données aux campagnes qui n'en ont pas.
      expect(actual.campaign.rules).toEqual(rulesOf(undefined));
      delete actual.campaign.rules;
      expect(actual).toEqual(expected[label]);
    });
  }

  it('restaure données et médias octet pour octet', async () => {
    const blob = load('sauvegarde-v1.zip');
    const id = await applyBackup(await readBackupFile(blob));
    expect(id).toBe(expected.actuelle.campaign.id);
    expect(await db.markers.count()).toBe(3);
    expect((await db.ambiances.toArray())[0].layers[1]).toMatchObject({ loop: false, intervalMin: 12, intervalMax: 40 });
    for (const [name, entry] of await readZip(blob)) {
      if (!name.startsWith('media/')) continue;
      const stored = await getMediaBlob(name.slice('media/'.length));
      expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(new Uint8Array(await (await entry.blob()).arrayBuffer()));
    }
  });

  it('refuse une sauvegarde démesurée sans saturer la mémoire', async () => {
    const big = JSON.parse(JSON.stringify(expected.actuelle));
    big.tables.locations = Array.from({ length: 200_000 }, () => ({ nope: true }));
    const { writeZip } = await import('./zip');
    const zip = await writeZip([{ name: 'grimoire.json', data: new Blob([JSON.stringify(big)]) }]);
    await expect(readBackupFile(zip)).rejects.toThrow(/invalides/);
  });
});
