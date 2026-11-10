import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Bronze doré : action principale
  primary:
    'sheen bg-gradient-to-b from-gold-300 to-bronze-500 text-leather-950 border border-gold-200/60 shadow-[0_2px_0_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.35)] hover:from-gold-200 hover:to-bronze-400',
  // Cuir avec liseré : action secondaire sur fond sombre
  secondary:
    'bg-leather-800/80 text-parchment-100 border border-bronze-500/60 hover:bg-leather-700 hover:border-bronze-400',
  ghost: 'text-parchment-200 hover:bg-parchment-100/10 border border-transparent',
  danger: 'bg-blood-600 text-parchment-50 border border-blood-500 hover:bg-blood-500',
  // Encre : action secondaire sur parchemin
  ink: 'bg-transparent text-ink-900 border border-ink-700/40 hover:bg-ink-900/5 hover:border-ink-700/70',
};

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-3 text-base gap-2',
  md: 'h-12 px-4 text-lg gap-2.5',
  lg: 'h-14 px-6 text-xl gap-3',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md font-serif font-medium select-none',
        'transition-[color,background-color,border-color,transform,box-shadow] duration-200 ease-out',
        'active:scale-[0.97] active:duration-75 disabled:opacity-45 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  tone?: 'dark' | 'light';
  size?: 'md' | 'lg';
}

/** Bouton icône : zone tactile ≥ 48 px, libellé accessible obligatoire. */
export function IconButton({ label, active, tone = 'dark', size = 'md', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-[color,background-color,transform] duration-200 active:scale-90 active:duration-75',
        size === 'md' ? 'size-12' : 'size-14',
        tone === 'dark'
          ? active
            ? 'bg-gold-300/20 text-gold-200'
            : 'text-parchment-200 hover:bg-parchment-100/10'
          : active
            ? 'bg-ink-900/10 text-ink-900'
            : 'text-ink-700 hover:bg-ink-900/5',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
