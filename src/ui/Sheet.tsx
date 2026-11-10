import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  side?: 'right' | 'bottom';
  /** Classe de largeur (côté droit) ou de hauteur (bas). */
  sizeClass?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Tiroir latéral ou inférieur : s'ouvre par-dessus l'écran courant, sans changer de page. */
export function Sheet({ open, onClose, title, subtitle, side = 'right', sizeClass, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-leather-950/65 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'absolute flex flex-col tex-leather frame-gilt shadow-2xl',
          side === 'right'
            ? cn('inset-y-0 right-0 animate-sheet-right rounded-l-xl', sizeClass ?? 'w-[min(560px,92vw)]')
            : cn('inset-x-0 bottom-0 animate-sheet-bottom rounded-t-xl', sizeClass ?? 'h-[min(78vh,720px)]'),
        )}
      >
        <header className="flex items-start gap-3 border-b border-bronze-500/30 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold tracking-wide text-gold-200 text-engraved">{title}</h2>
            {subtitle && <p className="mt-0.5 text-base text-parchment-300">{subtitle}</p>}
          </div>
          <IconButton label="Fermer" onClick={onClose}>
            <X className="size-6" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <footer className="border-t border-bronze-500/30 px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
