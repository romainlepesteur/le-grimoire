// Génère les icônes PNG de la PWA (rose des vents dorée sur cuir) sans dépendance externe.
// Usage : npm run icons
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(outDir, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function star(points, outer, inner, rotation) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    pts.push([Math.sin(a) * r, -Math.cos(a) * r]);
  }
  return pts;
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Couleur d'un point (coordonnées centrées, unité = taille de l'icône). */
function shade(x, y, { maskable, rounded }) {
  const s = maskable ? 0.78 : 1; // zone de sécurité des icônes "maskable"
  const half = 0.5;
  // Fond : carré arrondi (ou plein pour maskable)
  if (rounded && !maskable) {
    const r = 0.2;
    const qx = Math.max(Math.abs(x) - (half - r), 0);
    const qy = Math.max(Math.abs(y) - (half - r), 0);
    if (Math.hypot(qx, qy) > r) return null;
  }
  const d = Math.hypot(x, y);
  let c = mix([96, 60, 36], [28, 17, 11], Math.min(d / 0.62, 1));
  const u = x / s;
  const v = y / s;
  const du = Math.hypot(u, v);
  // Anneaux
  if (du > 0.335 && du < 0.36) c = [205, 165, 92];
  if (du > 0.3 && du < 0.31) c = [150, 110, 58];
  // Étoile secondaire (diagonales)
  const small = star(4, 0.27, 0.055, Math.PI / 4);
  if (inPolygon(u, v, small)) c = [138, 98, 48];
  // Étoile principale
  const main = star(4, 0.44, 0.075, 0);
  if (inPolygon(u, v, main)) {
    // Ombrage : moitié claire / moitié sombre de chaque branche
    const a = Math.atan2(u, -v);
    const sector = Math.round(a / (Math.PI / 2));
    const axis = sector * (Math.PI / 2);
    const rel = Math.sin(a - axis);
    c = rel >= 0 ? [238, 206, 136] : [176, 132, 66];
  }
  if (du < 0.028) c = [70, 44, 26];
  return [...c, 255];
}

function render(size, opts) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size - 0.5;
          const y = (py + (sy + 0.5) / ss) / size - 0.5;
          const col = shade(x, y, opts);
          if (col) {
            r += col[0]; g += col[1]; b += col[2]; a += 255;
          }
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      const alpha = a / n;
      const k = alpha > 0 ? 255 / alpha : 0;
      rgba[i] = Math.round((r / n) * k);
      rgba[i + 1] = Math.round((g / n) * k);
      rgba[i + 2] = Math.round((b / n) * k);
      rgba[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, rgba);
}

writeFileSync(outDir + 'icon-192.png', render(192, { rounded: true }));
writeFileSync(outDir + 'icon-512.png', render(512, { rounded: true }));
writeFileSync(outDir + 'icon-maskable-512.png', render(512, { maskable: true }));
writeFileSync(outDir + 'apple-touch-icon.png', render(180, { maskable: true }));
console.log('Icônes générées dans public/icons/');
