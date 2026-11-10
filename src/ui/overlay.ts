import { useEffect, useRef, type RefObject } from 'react';

/**
 * Gestion commune des fenêtres (tiroirs, dialogues, jet de fiche).
 *
 * - Pile des fenêtres ouvertes : seule celle du dessus réagit à Échap et garde le focus.
 * - Focus : placé dans la fenêtre à l'ouverture, limité à elle avec Tab / Maj+Tab,
 *   puis rendu à l'élément d'origine à la fermeture.
 * - Fond inerte : l'application (#root) ne reçoit plus ni focus ni clic tant qu'une fenêtre
 *   est ouverte (les notifications, hors de #root, restent utilisables).
 * - <html data-overlay> : met en pause les effets d'arrière-plan (fluidité sur tablette).
 */

const stack: symbol[] = [];

function sync() {
  const open = stack.length > 0;
  if (open) document.documentElement.dataset.overlay = 'open';
  else delete document.documentElement.dataset.overlay;
  const root = document.getElementById('root');
  if (root) root.inert = open;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !x.closest('[inert]') && x.getClientRects().length > 0);
}

export function useModal(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = Symbol('fenêtre');
    stack.push(id);
    sync();
    const previous = document.activeElement as HTMLElement | null;
    const isTop = () => stack[stack.length - 1] === id;

    // Focus initial sur la fenêtre elle-même (sans ouvrir le clavier virtuel) ;
    // un champ qui veut le focus (ajout rapide) le prend ensuite lui-même.
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (el && isTop() && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = ref.current;
      if (!el) return;
      const list = focusables(el);
      if (!list.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      sync();
      // Rendre le focus à l'élément qui avait ouvert la fenêtre (s'il est encore là).
      if (previous && document.contains(previous) && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    };
  }, [open, ref]);
}

/** Une fenêtre est-elle ouverte ? (effets d'arrière-plan en pause) */
export const overlayOpen = () => document.documentElement.dataset.overlay === 'open';

/**
 * Hauteur et position de la zone réellement visible (clavier virtuel ouvert, barre d'adresse…),
 * exposées en variables CSS --vv-h et --vv-top : les fenêtres s'y adaptent et gardent
 * leurs commandes accessibles.
 */
export function useVisualViewportVars() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const s = document.documentElement.style;
      s.setProperty('--vv-h', `${vv.height}px`);
      s.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}
