import { registerSW } from 'virtual:pwa-register';
import { usePwa } from '@/stores/pwa';
import { toast } from '@/stores/toasts';

/**
 * Enregistre le service worker (mise en cache de l'application pour le hors-ligne).
 * Les mises à jour ne sont jamais appliquées automatiquement : l'utilisateur choisit
 * le moment (pour ne pas recharger l'application en pleine partie).
 */
export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return;

  if (navigator.serviceWorker.controller) usePwa.setState({ offlineReady: true });

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      usePwa.setState({ needRefresh: true });
      toast({
        tone: 'info',
        title: 'Nouvelle version disponible',
        message: 'Elle sera appliquée quand vous le déciderez (Réglages).',
        duration: 8000,
      });
    },
    onOfflineReady() {
      usePwa.setState({ offlineReady: true });
      toast({ tone: 'success', title: 'Le Grimoire est prêt hors ligne' });
    },
    onRegisteredSW(_url, registration) {
      if (navigator.serviceWorker.controller) usePwa.setState({ offlineReady: true });
      // Vérifie les mises à jour toutes les heures quand le réseau est disponible.
      if (registration) setInterval(() => navigator.onLine && registration.update(), 60 * 60 * 1000);
    },
  });
  usePwa.setState({ applyUpdate: () => update(true) });
}
