import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { MotionConfig } from 'motion/react';
import { AppShell } from './AppShell';
import { bootstrap } from './bootstrap';
import { useSession } from '@/stores/session';
import { ExplorationPage } from '@/features/exploration/ExplorationPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AmbiancesPage } from '@/features/audio/AmbiancesPage';
import { CharactersPage, InventoryPage, JournalPage } from '@/features/placeholders/pages';
import { Panel } from '@/ui/Panel';

// La carte (Leaflet) n'est chargée qu'à la première ouverture de l'écran Carte.
const MapPage = lazy(() => import('@/features/map/MapPage'));

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
  const setCampaignId = useSession((s) => s.setCampaignId);
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });

  useEffect(() => {
    bootstrap()
      .then(({ campaignId }) => {
        setCampaignId(campaignId);
        setState({ ready: true });
      })
      .catch((e: Error) => setState({ ready: false, error: e.message }));
  }, [setCampaignId]);

  if (!state.ready) return <Splash error={state.error} />;

  return (
    // reducedMotion="user" : si Android est réglé sur « réduire les animations », Motion les coupe.
    <MotionConfig reducedMotion="user">
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ExplorationPage />} />
          <Route
            path="carte"
            element={
              <Suspense fallback={null}>
                <MapPage />
              </Suspense>
            }
          />
          <Route path="personnages" element={<CharactersPage />} />
          <Route path="inventaire" element={<InventoryPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="ambiances" element={<AmbiancesPage />} />
          <Route path="reglages" element={<SettingsPage />} />
          <Route path="*" element={<ExplorationPage />} />
        </Route>
      </Routes>
    </HashRouter>
    </MotionConfig>
  );
}
