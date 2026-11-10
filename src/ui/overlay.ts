import { useEffect } from 'react';

/**
 * Tiroir ou dialogue ouvert : on le signale sur <html data-overlay>, pour mettre en pause
 * les effets d'arrière-plan (brumes, lent zoom, poussières). Ils ne se voient plus sous le
 * voile sombre, et libèrent le processeur graphique de la tablette pour une animation fluide.
 */
let count = 0;

function sync() {
  if (count > 0) document.documentElement.dataset.overlay = 'open';
  else delete document.documentElement.dataset.overlay;
}

export function useOverlayOpen(open: boolean) {
  useEffect(() => {
    if (!open) return;
    count++;
    sync();
    return () => {
      count = Math.max(0, count - 1);
      sync();
    };
  }, [open]);
}

export const overlayOpen = () => document.documentElement.dataset.overlay === 'open';
