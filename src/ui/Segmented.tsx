import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Sélecteur à onglets compacts (gros boutons tactiles) ; la pastille dorée glisse d'un onglet à l'autre. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const group = useId();
  return (
    <div role="tablist" className={cn('inline-flex rounded-lg border border-bronze-500/40 bg-leather-950/50 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-10 min-w-24 rounded-md px-4 font-display text-sm font-semibold tracking-wider transition-colors duration-300',
              active ? 'text-leather-950' : 'text-parchment-300 hover:text-parchment-100',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-md bg-gradient-to-b from-gold-300/90 to-bronze-500/90 shadow"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
