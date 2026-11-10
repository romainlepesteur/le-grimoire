import { ImagePlus } from 'lucide-react';
import type { PlaceholderTheme } from '@/domain/schemas';
import { cn } from './cn';

/**
 * Cadre affiché tant qu'un lieu n'a pas d'illustration importée.
 * Volontairement abstrait (brume, lueur teintée selon le type de lieu) :
 * il ne prétend pas être une illustration et laisse toute la place à la vraie image.
 */
const MOODS: Record<PlaceholderTheme, { glow: string; base: string; mid: string }> = {
  auberge: { glow: '200 116 47', base: '#150b05', mid: '#3a1d0c' },
  ville: { glow: '178 122 74', base: '#0e0f14', mid: '#2a2530' },
  marche: { glow: '196 154 90', base: '#130f0a', mid: '#3a2c1c' },
  foret: { glow: '120 150 112', base: '#090f0b', mid: '#1f2d22' },
  collines: { glow: '201 160 96', base: '#10120c', mid: '#2e3322' },
  region: { glow: '170 150 110', base: '#0d0f11', mid: '#2a2e2a' },
  montagne: { glow: '154 166 184', base: '#0c0f15', mid: '#262c38' },
  cote: { glow: '127 154 174', base: '#0a0f13', mid: '#22303a' },
  ruines: { glow: '143 133 116', base: '#100f0d', mid: '#2b2822' },
  donjon: { glow: '138 90 58', base: '#090706', mid: '#221812' },
  autre: { glow: '160 138 106', base: '#0f0c09', mid: '#2a2219' },
};

export function EmptyIllustration({
  theme,
  animated = true,
  showHint = true,
  className,
}: {
  theme: PlaceholderTheme;
  animated?: boolean;
  showHint?: boolean;
  className?: string;
}) {
  const m = MOODS[theme] ?? MOODS.autre;
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      style={{ background: `radial-gradient(ellipse 80% 70% at 50% 62%, ${m.mid}, ${m.base} 75%)` }}
    >
      <div
        className={cn('absolute -inset-[20%] blur-3xl', animated && 'animate-mist-a')}
        style={{ background: `radial-gradient(ellipse 45% 35% at 35% 65%, rgb(${m.glow} / 0.32), transparent 70%)` }}
      />
      <div
        className={cn('absolute -inset-[20%] blur-3xl', animated && 'animate-mist-b')}
        style={{ background: `radial-gradient(ellipse 40% 30% at 70% 40%, rgb(${m.glow} / 0.18), transparent 70%)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.65))]" />

      {showHint && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-parchment-100/15 bg-leather-950/35 px-8 py-6 text-center backdrop-blur-[2px]">
            <ImagePlus className="size-9 text-parchment-300/70" strokeWidth={1.2} />
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-parchment-200/90">
              Aucune illustration
            </p>
            <p className="text-base leading-snug text-parchment-300/80">
              L’import d’images depuis l’interface arrive en phase 2 (mode Préparation).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
