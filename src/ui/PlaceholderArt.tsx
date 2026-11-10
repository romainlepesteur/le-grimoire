import { useId, useMemo } from 'react';
import type { PlaceholderTheme } from '@/domain/schemas';

/**
 * ILLUSTRATIONS PROVISOIRES.
 * Paysages vectoriels simples, générés dans le code, uniquement pour que l'interface
 * ne soit pas vide. Ils sont toujours affichés avec la mention « Illustration provisoire »
 * et doivent être remplacés par de vraies images importées.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function hillPath(seed: number, base: number, amp: number, steps = 9): string {
  const r = rng(seed);
  let d = `M0 900 L0 ${base}`;
  const w = 1600 / steps;
  for (let i = 0; i < steps; i++) {
    const x1 = i * w + w / 2;
    const y1 = base - amp * (0.4 + r() * 0.8);
    const x2 = (i + 1) * w;
    const y2 = base - amp * r() * 0.5;
    d += ` Q${x1.toFixed(0)} ${y1.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}`;
  }
  return d + ' L1600 900 Z';
}

function conifers(seed: number, count: number, baseY: number, minH: number, maxH: number, color: string) {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const x = (i / count) * 1700 - 50 + r() * 40;
    const h = minH + r() * (maxH - minH);
    const w = h * 0.32;
    const y = baseY + r() * 30;
    return <path key={i} d={`M${x} ${y - h} L${x + w} ${y} L${x - w} ${y} Z`} fill={color} />;
  });
}

function Sky({ id, top, mid, horizon }: { id: string; top: string; mid: string; horizon: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={horizon} />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill={`url(#${id}-sky)`} />
    </>
  );
}

function Landscape({ id, forest }: { id: string; forest?: boolean }) {
  return (
    <>
      <Sky id={id} top="#1f2b3a" mid="#6b5a55" horizon="#d39a5e" />
      <circle cx="1120" cy="470" r="220" fill="#f4c27a" opacity="0.18" />
      <circle cx="1120" cy="470" r="70" fill="#f8d79a" opacity="0.55" />
      <path d={hillPath(3, 520, 90, 7)} fill="#5c5f6b" opacity="0.75" />
      <path d={hillPath(7, 590, 110, 8)} fill="#4a5245" />
      {forest && conifers(11, 70, 600, 30, 70, '#36402f')}
      <path d={hillPath(13, 680, 120, 6)} fill="#2f3a2a" />
      <path d={hillPath(17, 790, 110, 5)} fill="#1d2619" />
    </>
  );
}

function Town({ id }: { id: string }) {
  const r = rng(42);
  const houses = Array.from({ length: 26 }, (_, i) => {
    const x = 380 + i * 34 + r() * 10;
    const w = 26 + r() * 22;
    const h = 40 + r() * 70 - Math.abs(i - 13) * 2;
    const y = 600 - h;
    return (
      <g key={i}>
        <rect x={x} y={y} width={w} height={h + 40} fill="#1b1714" />
        <path d={`M${x - 4} ${y} L${x + w / 2} ${y - 22 - r() * 10} L${x + w + 4} ${y} Z`} fill="#16120f" />
        {r() > 0.35 && <rect x={x + w / 3} y={y + h / 3} width="5" height="7" fill="#f2b45c" opacity="0.9" />}
      </g>
    );
  });
  return (
    <>
      <Sky id={id} top="#18222f" mid="#5b4a50" horizon="#c98552" />
      <circle cx="400" cy="420" r="260" fill="#f0b46a" opacity="0.12" />
      <path d={hillPath(5, 560, 80, 7)} fill="#4a4a52" opacity="0.8" />
      <path d="M300 900 L300 640 Q800 560 1300 640 L1300 900 Z" fill="#26231f" />
      {houses}
      <rect x="760" y="380" width="40" height="230" fill="#141110" />
      <path d="M752 380 L780 320 L808 380 Z" fill="#141110" />
      <rect x="1080" y="440" width="34" height="170" fill="#141110" />
      <path d="M1074 440 L1097 395 L1120 440 Z" fill="#141110" />
      <path d="M340 610 H1250 V630 H340 Z" fill="#181512" />
      <path d={hillPath(23, 800, 90, 5)} fill="#1a1d16" />
    </>
  );
}

function Tavern({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-fire`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd28a" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#f08a3c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7a2e10" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-room`} cx="0.7" cy="0.65" r="0.9">
          <stop offset="0" stopColor="#6a3a1c" />
          <stop offset="0.5" stopColor="#2e1a0e" />
          <stop offset="1" stopColor="#100905" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill={`url(#${id}-room)`} />
      <rect y="700" width="1600" height="200" fill="#1a0f08" />
      <rect x="0" y="70" width="1600" height="40" fill="#160c06" />
      <rect x="0" y="200" width="1600" height="26" fill="#170d07" opacity="0.9" />
      {[180, 560, 1460].map((x) => (
        <rect key={x} x={x} y="70" width="46" height="660" fill="#150c06" />
      ))}
      <path d="M980 700 V420 Q1120 330 1260 420 V700 Z" fill="#2b2420" />
      <path d="M1020 700 V450 Q1120 380 1220 450 V700 Z" fill="#0d0705" />
      <ellipse cx="1120" cy="640" rx="260" ry="200" fill={`url(#${id}-fire)`} />
      <path d="M1060 700 Q1080 600 1110 660 Q1120 560 1150 650 Q1170 610 1180 700 Z" fill="#ffb24f" opacity="0.85" />
      <circle cx="420" cy="300" r="170" fill={`url(#${id}-fire)`} opacity="0.45" />
      <path d="M420 110 V282" stroke="#0c0603" strokeWidth="3" />
      <circle cx="420" cy="300" r="12" fill="#ffd690" />
      <path d="M250 760 H700 V780 H250 Z M280 780 H300 V880 H280 Z M650 780 H670 V880 H650 Z" fill="#0c0603" />
      <path d="M760 790 H900 V805 H760 Z M770 805 H782 V880 H770 Z M878 805 H890 V880 H878 Z" fill="#0c0603" />
    </>
  );
}

function Market({ id }: { id: string }) {
  const r = rng(77);
  const colors = ['#7d2f24', '#2f5038', '#a67a2c', '#5a3a5c'];
  const tents = Array.from({ length: 7 }, (_, i) => {
    const x = 60 + i * 230 + r() * 30;
    const w = 190;
    const y = 560 + r() * 30;
    const c = colors[i % colors.length];
    return (
      <g key={i}>
        <path d={`M${x} ${y} L${x + w / 2} ${y - 90} L${x + w} ${y} Z`} fill={c} />
        <path d={`M${x + w / 2} ${y - 90} L${x + w * 0.62} ${y} L${x + w * 0.38} ${y} Z`} fill="#e9d8b0" opacity="0.35" />
        <rect x={x + 10} y={y} width={w - 20} height="120" fill="#1e140d" opacity="0.92" />
        <rect x={x + 10} y={y + 40} width={w - 20} height="10" fill="#3b2817" />
      </g>
    );
  });
  return (
    <>
      <Sky id={id} top="#5f7c96" mid="#b9a284" horizon="#e3c08a" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <rect x={i * 185 - 20} y={260 + (i % 3) * 30} width="170" height="400" fill={i % 2 ? '#6d5a48' : '#5c4a3b'} />
          <path d={`M${i * 185 - 30} ${260 + (i % 3) * 30} L${i * 185 + 65} ${180 + (i % 3) * 30} L${i * 185 + 160} ${260 + (i % 3) * 30} Z`} fill="#3d2c22" />
          <rect x={i * 185 + 30} y={340 + (i % 3) * 30} width="26" height="40" fill="#2a1e16" />
          <rect x={i * 185 + 95} y={340 + (i % 3) * 30} width="26" height="40" fill="#2a1e16" />
        </g>
      ))}
      <rect y="660" width="1600" height="240" fill="#8a7458" />
      <rect y="660" width="1600" height="240" fill="#000" opacity="0.25" />
      {tents}
    </>
  );
}

function Forest({ id }: { id: string }) {
  const r = rng(99);
  const trunks = (seed: number, n: number, color: string, wMin: number, wMax: number) => {
    const rr = rng(seed);
    return Array.from({ length: n }, (_, i) => {
      const x = (i / n) * 1650 - 30 + rr() * 60;
      const w = wMin + rr() * (wMax - wMin);
      return <rect key={i} x={x} y={-20} width={w} height={940} fill={color} />;
    });
  };
  return (
    <>
      <Sky id={id} top="#36443b" mid="#6c7a68" horizon="#a9ae94" />
      {trunks(1, 22, '#5d6a5a', 10, 22)}
      <rect width="1600" height="900" fill="#c8cdb8" opacity="0.25" />
      {trunks(2, 14, '#3a4638', 22, 40)}
      {conifers(5, 30, 760, 180, 320, '#2c3a2c')}
      <rect width="1600" height="900" fill="#b9c2a8" opacity="0.15" />
      {trunks(3, 8, '#1c241b', 50, 90)}
      {Array.from({ length: 5 }, (_, i) => (
        <path
          key={i}
          d={`M${500 + i * 160} 0 L${560 + i * 160} 0 L${300 + i * 200 + r() * 80} 900 L${180 + i * 200} 900 Z`}
          fill="#f6eecf"
          opacity="0.06"
        />
      ))}
      <path d={hillPath(8, 840, 40, 6)} fill="#151c13" />
    </>
  );
}

function Mountains({ id }: { id: string }) {
  return (
    <>
      <Sky id={id} top="#2a3646" mid="#7d8a9c" horizon="#d8d2c4" />
      <path d="M0 640 L220 360 L330 450 L520 220 L700 470 L860 300 L1060 520 L1250 260 L1450 470 L1600 380 L1600 900 L0 900 Z" fill="#59606e" />
      <path d="M470 280 L520 220 L575 300 L545 290 L520 320 L495 295 Z M1200 320 L1250 260 L1305 335 L1270 325 L1250 350 L1228 330 Z M820 345 L860 300 L905 360 L870 352 Z" fill="#eef0f2" />
      <path d={hillPath(31, 720, 140, 6)} fill="#3a4040" />
      {conifers(33, 60, 760, 30, 80, '#232a24')}
      <path d={hillPath(37, 830, 90, 5)} fill="#171c18" />
    </>
  );
}

const SCENES: Record<PlaceholderTheme, (p: { id: string }) => React.ReactElement> = {
  region: (p) => <Landscape {...p} forest />,
  collines: (p) => <Landscape {...p} />,
  ville: Town,
  auberge: Tavern,
  marche: Market,
  foret: Forest,
  montagne: Mountains,
  cote: (p) => <Landscape {...p} />,
  ruines: (p) => <Landscape {...p} />,
  donjon: Tavern,
  autre: (p) => <Landscape {...p} forest />,
};

export function PlaceholderArt({ theme, className }: { theme: PlaceholderTheme; className?: string }) {
  const rawId = useId();
  const id = useMemo(() => `pa${rawId.replace(/[^a-zA-Z0-9]/g, '')}`, [rawId]);
  const Scene = SCENES[theme] ?? SCENES.autre;
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <Scene id={id} />
    </svg>
  );
}
