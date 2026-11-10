import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';
import { EASE_OUT } from './motion';
import { useOverlayOpen } from './overlay';

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

/** Tiroir latéral ou inférieur : glisse par-dessus l'écran courant, sans changer de page. */
export function Sheet({ open, onClose, title, subtitle, side = 'right', sizeClass, children, footer }: SheetProps) {
  useOverlayOpen(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const offscreen = side === 'right' ? { x: '104%' } : { y: '104%' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-leather-950/75"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.div
            className={cn(
              'absolute flex flex-col tex-leather frame-gilt shadow-2xl',
              side === 'right'
                ? cn('inset-y-0 right-0 rounded-l-xl', sizeClass ?? 'w-[min(560px,92vw)]')
                : cn('inset-x-0 bottom-0 rounded-t-xl', sizeClass ?? 'h-[min(78vh,720px)]'),
            )}
            initial={offscreen}
            animate={{ x: 0, y: 0 }}
            exit={{ ...offscreen, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <header className="flex items-start gap-3 border-b border-bronze-500/30 px-5 pt-4 pb-3">
              <motion.div
                className="min-w-0 flex-1"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.15, ease: EASE_OUT }}
              >
                <h2 className="font-display text-xl font-semibold tracking-wide text-gold-200 text-engraved">{title}</h2>
                {subtitle && <p className="mt-0.5 text-base text-parchment-300">{subtitle}</p>}
              </motion.div>
              <IconButton label="Fermer" onClick={onClose}>
                <X className="size-6" />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
            {footer && <footer className="border-t border-bronze-500/30 px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
