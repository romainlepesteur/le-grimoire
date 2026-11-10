import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Panel } from './Panel';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}

export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-leather-950/70 backdrop-blur-[2px]" onClick={onClose} />
      <Panel ornate className="relative w-full max-w-lg animate-pop-in px-7 pt-7 pb-5">
        <h2 className="font-display text-xl font-semibold tracking-wide text-ink-900">{title}</h2>
        <div className="mt-3 text-lg text-ink-700">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div>
      </Panel>
    </div>,
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
