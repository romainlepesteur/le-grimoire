import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** Ornement d'angle discret, inspiré des encadrements de manuscrits. */
function Corner({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn('pointer-events-none absolute size-7 text-bronze-500/80', className)}
    >
      <path d="M2 30V10Q2 2 10 2h20" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 30V12q0-6 6-6h18" fill="none" stroke="currentColor" strokeWidth=".7" opacity=".7" />
      <path d="M9.5 9.5l3 0 0 3-3 0z" fill="currentColor" transform="rotate(45 11 11)" />
    </svg>
  );
}

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'parchment' | 'leather';
  ornate?: boolean;
}

export function Panel({ tone = 'parchment', ornate = false, className, children, ...rest }: PanelProps) {
  return (
    <div
      className={cn(
        'relative rounded-lg frame-gilt',
        tone === 'parchment' ? 'tex-parchment text-ink-900' : 'tex-leather text-parchment-100',
        className,
      )}
      {...rest}
    >
      {ornate && (
        <>
          <Corner className="left-1.5 top-1.5" />
          <Corner className="right-1.5 top-1.5 rotate-90" />
          <Corner className="right-1.5 bottom-1.5 rotate-180" />
          <Corner className="left-1.5 bottom-1.5 -rotate-90" />
        </>
      )}
      {children}
    </div>
  );
}

/** Filet séparateur avec losange central. */
export function Divider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-bronze-500/70', className)} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-current" />
      <svg viewBox="0 0 20 10" className="h-2.5 w-5">
        <path d="M0 5h6M14 5h6" stroke="currentColor" strokeWidth="1" />
        <path d="M10 1l4 4-4 4-4-4z" fill="currentColor" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-current" />
    </div>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('font-display text-sm font-semibold uppercase tracking-[0.18em]', className)}>{children}</h2>
  );
}
