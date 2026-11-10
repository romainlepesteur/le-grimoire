import { CircleCheck, Info, TriangleExclamationPoint, X } from 'lucide-react';
import { useToasts, type ToastTone } from '@/stores/toasts';
import { cn } from './cn';

const ICONS: Record<ToastTone, React.ReactNode> = {
  info: <Info className="size-5 text-gold-300" />,
  success: <CircleCheck className="size-5 text-forest-500" />,
  warning: <TriangleExclamationPoint className="size-5 text-ember-500" />,
  error: <TriangleExclamationPoint className="size-5 text-blood-500" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-md animate-pop-in items-start gap-3 rounded-lg px-4 py-3 tex-parchment frame-gilt',
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
        </div>
      ))}
    </div>
  );
}
