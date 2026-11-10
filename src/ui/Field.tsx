import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

/** Contrôles de formulaire sur fond cuir (tiroirs de Préparation). Zones tactiles ≥ 48 px. */

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-parchment-400">{hint}</span>}
    </label>
  );
}

const control =
  'w-full rounded-md border border-bronze-500/35 bg-leather-950/60 text-lg text-parchment-50 placeholder:text-parchment-400/60 outline-none transition-colors focus:border-gold-300/70 focus:bg-leather-950/80';

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-12 px-3', className)} {...rest} />;
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-32 resize-y px-3 py-2 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'h-12 appearance-none bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10 pl-3 select-chevron', className)} {...rest}>
      {children}
    </select>
  );
}

/** Curseur de volume. */
export function Slider({
  value,
  onChange,
  label,
  className,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className={cn('range-gilt h-10 w-full cursor-pointer disabled:opacity-40', className)}
      style={{ ['--fill' as string]: `${Math.round(value * 100)}%` }}
    />
  );
}
