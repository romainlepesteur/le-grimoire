import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { MotionConfig } from 'motion/react';
import { AppShell } from './AppShell';
import { startup } from './bootstrap';
import { useSession } from '@/stores/session';
import { ExplorationPage } from '@/features/exploration/ExplorationPage';
import { HomePage } from '@/features/home/HomePage';
import { Toaster } from '@/ui/Toaster';
import { Panel } from '@/ui/Panel';
import { useVisualViewportVars } from '@/ui/overlay';

/**
 * Chaque écran secondaire est un fichier séparé, chargé à sa première ouverture :
 * le démarrage ne charge que l'Exploration. Tous les fichiers restent en cache
 * (service worker), donc disponibles hors ligne.
 */
function lazyScreen(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Lazy = lazy(load); // créé une seule fois, au chargement du module
  return function Screen() {
    return (
      <Suspense fallback={null}>
        <Lazy />
      </Suspense>
    );
  };
}
const MapPage = lazyScreen(() => import('@/features/map/MapPage'));
const CharactersPage = lazyScreen(() => import('@/features/characters/CharactersPage').then((m) => ({ default: m.CharactersPage })));
const InventoryPage = lazyScreen(() => import('@/features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const JournalPage = lazyScreen(() => import('@/features/journal/JournalPage').then((m) => ({ default: m.JournalPage })));
const AmbiancesPage = lazyScreen(() => import('@/features/audio/AmbiancesPage').then((m) => ({ default: m.AmbiancesPage })));
const SettingsPage = lazyScreen(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function Splash({ error }: { error?: string }) {
  return (
    <div className="flex h-dvh items-center justify-center p-6 tex-leather">
      {error ? (
        <Panel ornate className="max-w-lg px-8 py-8">
          <h1 className="font-display text-2xl text-ink-900">Le grimoire ne peut pas s’ouvrir</h1>
          <p className="mt-3 text-lg text-ink-700">{error}</p>
          <p className="mt-3 text-base text-ink-500">
            Vos données ne sont pas perdues pour autant. Fermez puis rouvrez l’application ; si le problème persiste,
            vérifiez l’espace libre de l’appareil.
          </p>
        </Panel>
      ) : (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src="./icons/favicon.svg" alt="" className="size-20 animate-compass-in" />
          <p className="font-display text-lg tracking-[0.2em] text-parchment-300">Ouverture du grimoire…</p>
        </div>
      )}
    </div>
  );
}

export function App() {
  const campaignId = useSession((s) => s.campaignId);
  // Zone réellement visible (clavier virtuel compris), pour caler les fenêtres.
  useVisualViewportVars();
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });

  useEffect(() => {
    // Aucune campagne n'est ouverte d'office : l'accueil les présente.
    startup()
      .then(() => setState({ ready: true }))
      .catch((e: Error) => setState({ ready: false, error: e.message }));
  }, []);

  if (!state.ready) return <Splash error={state.error} />;

  return (
    // reducedMotion="user" : si Android est réglé sur « réduire les animations », Motion les coupe.
    <MotionConfig reducedMotion="user">
    {campaignId ? (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ExplorationPage />} />
          <Route path="carte" element={<MapPage />} />
          <Route path="personnages" element={<CharactersPage />} />
          <Route path="inventaire" element={<InventoryPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="ambiances" element={<AmbiancesPage />} />
          <Route path="reglages" element={<SettingsPage />} />
          <Route path="*" element={<ExplorationPage />} />
        </Route>
      </Routes>
    </HashRouter>
    ) : (
      <HomePage />
    )}
    <Toaster />
    </MotionConfig>
  );
}
