import { useState } from 'react';
import { motion } from 'motion/react';
import { parseHpDelta } from '@/domain/quickEntry';
import type { Character } from '@/domain/schemas';
import { adjustHp } from '@/services/db/play';
import { cn } from '@/ui/cn';

/** Points de vie : barre, boutons rapides (−5 −1 +1 +5) et saisie libre (« -7 », « +3 »). */
export function HpControl({ character, compact, light }: { character: Character; compact?: boolean; light?: boolean }) {
  const [custom, setCustom] = useState('');
  const { hpCurrent: cur, hpMax: max } = character;
  const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  const color = ratio > 0.5 ? 'from-forest-500 to-forest-700' : ratio > 0.25 ? 'from-ember-500 to-bronze-600' : 'from-blood-500 to-blood-600';

  const apply = (d: number) => void adjustHp(character.id, d);
  const btn = cn(
    'h-11 min-w-12 rounded-md border px-2 font-display text-base font-semibold tabular-nums transition-[color,background-color,transform] active:scale-90',
    light ? 'border-ink-700/30 text-ink-900 hover:bg-ink-900/5' : 'border-bronze-500/35 text-parchment-100 hover:bg-parchment-100/8',
  );

  return (
    <div className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
      <div className="flex items-center gap-3">
        <div className={cn('relative flex-1 overflow-hidden rounded-full', compact ? 'h-3' : 'h-4', light ? 'bg-ink-900/10' : 'bg-parchment-100/10')}>
          <motion.div
            className={cn('absolute inset-y-0 left-0 rounded-full bg-gradient-to-r', color)}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 24 }}
          />
        </div>
        <motion.span
          key={cur}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          className={cn('min-w-16 text-right font-display font-semibold tabular-nums', compact ? 'text-lg' : 'text-2xl', light ? 'text-ink-900' : 'text-parchment-50', cur <= 0 && 'text-blood-500')}
        >
          {cur}
          <span className={cn('text-base font-normal', light ? 'text-ink-500' : 'text-parchment-400')}> / {max}</span>
        </motion.span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={cn(btn, 'text-blood-500')} onClick={() => apply(-5)} aria-label="Perdre 5 points de vie">
          −5
        </button>
        <button type="button" className={cn(btn, 'text-blood-500')} onClick={() => apply(-1)} aria-label="Perdre 1 point de vie">
          −1
        </button>
        <button type="button" className={cn(btn, 'text-forest-500')} onClick={() => apply(1)} aria-label="Récupérer 1 point de vie">
          +1
        </button>
        <button type="button" className={cn(btn, 'text-forest-500')} onClick={() => apply(5)} aria-label="Récupérer 5 points de vie">
          +5
        </button>
        <form
          className="flex flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const d = parseHpDelta(custom);
            if (d != null) {
              apply(d);
              setCustom('');
            }
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="numeric"
            placeholder="−7 ou +3"
            aria-label={`Variation des points de vie de ${character.name}`}
            className={cn(
              'h-11 w-24 min-w-0 flex-1 rounded-md border px-3 text-lg outline-none',
              light ? 'border-ink-700/30 bg-parchment-50/70 text-ink-900 focus:border-bronze-600' : 'border-bronze-500/35 bg-leather-950/60 text-parchment-50 focus:border-gold-300/70',
            )}
          />
          <button type="submit" className={btn} disabled={parseHpDelta(custom) == null}>
            OK
          </button>
        </form>
      </div>
    </div>
  );
}
