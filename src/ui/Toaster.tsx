import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, Info, TriangleExclamationPoint, X } from 'lucide-react';
import { useToasts, type ToastTone } from '@/stores/toasts';
import { cn } from './cn';
import { EASE_OUT } from './motion';

const ICONS: Record<ToastTone, React.ReactNode> = {
  info: <Info className="size-5 text-gold-300" />,
  success: <CircleCheck className="size-5 text-forest-500" />,
  warning: <TriangleExclamationPoint className="size-5 text-ember-500" />,
  error: <TriangleExclamationPoint className="size-5 text-blood-500" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  // Hors de #root : les notifications (et leur bouton « Annuler ») restent utilisables
  // quand une fenêtre rend le reste de l'application inerte.
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.2 } }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg px-4 py-3 tex-parchment frame-gilt',
              t.tone === 'error' && 'ring-2 ring-blood-500/60',
            )}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <div className="mt-0.5">{ICONS[t.tone]}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">{t.title}</p>
              {t.message && <p className="text-base text-ink-700">{t.message}</p>}
              {t.action && (
                <button
                  type="button"
                  className="mt-1 font-semibold text-bronze-700 underline underline-offset-2"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" aria-label="Fermer" className="-m-1 rounded p-1 text-ink-500 hover:text-ink-900" onClick={() => dismiss(t.id)}>
              <X className="size-5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
