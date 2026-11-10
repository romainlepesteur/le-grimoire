import { inflateSync } from 'fflate';

/**
 * Lecture/écriture minimaliste de fichiers ZIP, pensée pour les gros médias :
 * - l'écriture assemble des `Blob` sans recopier les fichiers en mémoire ;
 * - la lecture découpe le fichier (`Blob.slice`) sans le charger entièrement.
 * Les entrées sont écrites sans compression (images et sons sont déjà compressés).
 * Les entrées compressées (deflate) sont acceptées en lecture, pour les ZIP refaits
 * à la main avec un autre outil. ZIP64 (> 4 Go) n'est pas pris en charge.
 */

export interface ZipInputEntry {
  name: string;
  data: Blob;
  date?: Date;
}

export interface ZipEntry {
  name: string;
  size: number;
  compressedSize: number;
  method: number;
  /** Contenu décompressé. */
  blob(type?: string): Promise<Blob>;
}

export class ZipFormatError extends Error {}

const MAX_U32 = 0xffffffff;

// --- CRC32 -----------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crcUpdate(crc: number, bytes: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c;
}

export async function crc32OfBlob(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  const CHUNK = 4 * 1024 * 1024;
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const part = new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer());
    crc = crcUpdate(crc, part);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- Écriture ----------------------------------------------------------------

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export async function writeZip(entries: ZipInputEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.data.size;
    if (size >= MAX_U32 || offset >= MAX_U32) {
      throw new ZipFormatError('Sauvegarde trop volumineuse (limite : 4 Go).');
    }
    const crc = await crc32OfBlob(entry.data);
    const { time, date } = dosDateTime(entry.date ?? new Date());

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version nécessaire
    lv.setUint16(6, 0x0800, true); // noms en UTF-8
    lv.setUint16(8, 0, true); // stocké, sans compression
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);

    parts.push(local, entry.data);
    central.push(cd);
    offset += local.length + size;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  if (offset + cdSize >= MAX_U32 || entries.length >= 0xffff) {
    throw new ZipFormatError('Sauvegarde trop volumineuse (limite : 4 Go).');
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// --- Lecture -----------------------------------------------------------------

async function bytesOf(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export async function readZip(file: Blob): Promise<Map<string, ZipEntry>> {
  if (file.size < 22) throw new ZipFormatError("Ce fichier n'est pas une archive ZIP.");
  const tailStart = Math.max(0, file.size - 65557);
  const tail = await bytesOf(file, tailStart, file.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipFormatError("Ce fichier n'est pas une archive ZIP.");

  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (cdOffset === MAX_U32 || count === 0xffff) {
    throw new ZipFormatError('Archive ZIP64 non prise en charge.');
  }
  if (cdOffset + cdSize > file.size) throw new ZipFormatError('Archive ZIP tronquée ou endommagée.');

  const cd = await bytesOf(file, cdOffset, cdOffset + cdSize);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();

  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cv.getUint32(p, true) !== 0x02014b50) {
      throw new ZipFormatError('Archive ZIP endommagée (répertoire central invalide).');
    }
    const method = cv.getUint16(p + 10, true);
    const compressedSize = cv.getUint32(p + 20, true);
    const size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const localOffset = cv.getUint32(p + 42, true);
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // dossier

    const entry: ZipEntry = {
      name,
      size,
      compressedSize,
      method,
      async blob(type = '') {
        const header = await bytesOf(file, localOffset, localOffset + 30);
        const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
        if (hv.getUint32(0, true) !== 0x04034b50) {
          throw new ZipFormatError(`Entrée « ${name} » endommagée.`);
        }
        const start = localOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
        const raw = file.slice(start, start + compressedSize, type);
        if (method === 0) return raw;
        if (method === 8) {
          const out = inflateSync(new Uint8Array(await raw.arrayBuffer()));
          return new Blob([out as Uint8Array<ArrayBuffer>], { type });
        }
        throw new ZipFormatError(`Méthode de compression non prise en charge pour « ${name} ».`);
      },
    };
    entries.set(name, entry);
  }
  return entries;
}
