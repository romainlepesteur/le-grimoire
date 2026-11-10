import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from './Button';
import { Panel } from './Panel';
import { EASE_OUT } from './motion';
import { useModal } from './overlay';
import { VISIBLE_AREA } from './Sheet';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}

export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(open, panel, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0 z-50 flex items-center justify-center p-4" style={VISIBLE_AREA}>
          <motion.div
            className="absolute inset-0 bg-leather-950/80"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
          <motion.div
            ref={panel}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative flex max-h-full w-full max-w-lg outline-none"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.18 } }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            {/* Hauteur limitée à la zone visible : le texte défile, les boutons restent affichés. */}
            <Panel ornate className="flex max-h-full min-h-0 w-full flex-col px-7 pt-7 pb-5">
              <h2 id={titleId} className="shrink-0 font-display text-xl font-semibold tracking-wide text-ink-900">
                {title}
              </h2>
              <div className="mt-3 min-h-0 overflow-y-auto text-lg text-ink-700 scrollbar-thin">{children}</div>
              <div className="mt-6 flex shrink-0 flex-wrap justify-end gap-3">{actions}</div>
            </Panel>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant="ink" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}
