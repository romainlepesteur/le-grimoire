import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { crc32OfBlob, readZip, writeZip } from './zip';

describe('zip', () => {
  it('relit exactement ce qui a été écrit', async () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
    const zip = await writeZip([
      { name: 'grimoire.json', data: new Blob(['{"a":1}']) },
      { name: 'media/éèà-ü.bin', data: new Blob([big]) },
    ]);
    const entries = await readZip(zip);
    expect([...entries.keys()]).toEqual(['grimoire.json', 'media/éèà-ü.bin']);
    expect(await (await entries.get('grimoire.json')!.blob()).text()).toBe('{"a":1}');
    const back = new Uint8Array(await (await entries.get('media/éèà-ü.bin')!.blob()).arrayBuffer());
    expect(back).toEqual(big);
  });

  it('calcule un CRC32 standard', async () => {
    expect(await crc32OfBlob(new Blob(['123456789']))).toBe(0xcbf43926);
  });

  it('lit un ZIP compressé produit par un autre outil', async () => {
    const other = zipSync({ 'grimoire.json': strToU8('{"ok":true}'.repeat(50)) }, { level: 9 });
    const entries = await readZip(new Blob([other as Uint8Array<ArrayBuffer>]));
    const entry = entries.get('grimoire.json')!;
    expect(entry.method).toBe(8);
    expect(await (await entry.blob()).text()).toBe('{"ok":true}'.repeat(50));
  });

  it('rejette un fichier qui n’est pas un ZIP', async () => {
    await expect(readZip(new Blob(['ceci n’est pas un zip, juste du texte assez long']))).rejects.toThrow(
      /archive ZIP/,
    );
  });
});
