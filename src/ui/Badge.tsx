import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'bronze' | 'forest' | 'blood' | 'ink' | 'muted';

const TONES: Record<Tone, string> = {
  bronze: 'border-bronze-500/60 bg-bronze-500/15 text-gold-200',
  forest: 'border-forest-500/60 bg-forest-700/40 text-parchment-100',
  blood: 'border-blood-500/70 bg-blood-600/30 text-parchment-50',
  ink: 'border-ink-700/40 bg-ink-900/5 text-ink-700',
  muted: 'border-parchment-200/20 bg-parchment-100/5 text-parchment-300',
};

export function Badge({ tone = 'bronze', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.14em]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
