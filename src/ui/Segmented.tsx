import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Sélecteur à onglets compacts (gros boutons tactiles). */
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
  return (
    <div role="tablist" className={cn('inline-flex rounded-lg border border-bronze-500/40 bg-leather-950/50 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-10 min-w-24 rounded-md px-4 font-display text-sm font-semibold tracking-wider transition-colors',
            o.value === value
              ? 'bg-gradient-to-b from-gold-300/90 to-bronze-500/90 text-leather-950 shadow'
              : 'text-parchment-300 hover:text-parchment-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
