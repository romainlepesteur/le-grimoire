import { useCallback, useEffect, useState } from 'react';

/**
 * Empêche l'écran de se mettre en veille pendant une session (Screen Wake Lock API).
 * Le verrou est relâché par le navigateur quand l'onglet est masqué : on le reprend au retour.
 */
export function useWakeLock(enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) {
      setActive(false);
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (disposed) {
          void sentinel.release();
          return;
        }
        setActive(true);
        sentinel.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [enabled]);
  return active;
}

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }, []);
  return { supported, active, toggle };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
