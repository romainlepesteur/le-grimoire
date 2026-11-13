import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';
import { EASE_OUT } from './motion';
import { useModal } from './overlay';

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

/**
 * Zone réellement visible (clavier virtuel ouvert compris) : la fenêtre s'y cale,
 * son contenu défile et son pied (boutons) reste accessible.
 */
export const VISIBLE_AREA = { top: 'var(--vv-top, 0px)', height: 'var(--vv-h, 100dvh)' } as const;

/** Tiroir latéral ou inférieur : glisse par-dessus l'écran courant, sans changer de page. */
export function Sheet({ open, onClose, title, subtitle, side = 'right', sizeClass, children, footer }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(open, panel, onClose);

  // Fluidité sur tablette : on anime la propriété `transform` entière (et non x / y séparés).
  // Le navigateur fait alors glisser le panneau sur sa propre couche graphique, hors du fil
  // principal : le glissement reste régulier même pendant que le contenu se construit.
  const offscreen = { transform: side === 'right' ? 'translateX(104%)' : 'translateY(104%)' };
  const onscreen = { transform: side === 'right' ? 'translateX(0%)' : 'translateY(0%)' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0 z-40" style={VISIBLE_AREA}>
          <motion.div
            className="absolute inset-0 bg-leather-950/75"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cn(
              'absolute flex max-h-full flex-col tex-leather frame-gilt shadow-2xl outline-none will-change-transform',
              side === 'right'
                ? cn('inset-y-0 right-0 rounded-l-xl', sizeClass ?? 'w-[min(560px,92vw)]')
                : cn('inset-x-0 bottom-0 rounded-t-xl', sizeClass ?? 'h-[min(78vh,720px)]'),
            )}
            initial={offscreen}
            animate={onscreen}
            exit={{ ...offscreen, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-bronze-500/30 px-5 pt-4 pb-3">
              <motion.div
                className="min-w-0 flex-1"
                initial={{ opacity: 0, transform: 'translateX(12px)' }}
                animate={{ opacity: 1, transform: 'translateX(0px)' }}
                transition={{ duration: 0.45, delay: 0.15, ease: EASE_OUT }}
              >
                <h2 id={titleId} className="font-display text-xl font-semibold tracking-wide text-gold-200 text-engraved">
                  {title}
                </h2>
                {subtitle && <p className="mt-0.5 text-base text-parchment-300">{subtitle}</p>}
              </motion.div>
              <IconButton label="Fermer" onClick={onClose}>
                <X className="size-6" />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
            {footer && <footer className="shrink-0 border-t border-bronze-500/30 px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
