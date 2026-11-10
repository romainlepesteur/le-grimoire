import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dices, Eye, Map, Minimize, Music, ScrollText, Star, Users } from 'lucide-react';
import { LOCATION_KIND_LABELS } from '@/domain/schemas';
import { useActiveCampaign, useCurrentPlace } from '@/hooks/data';
import { toggleFavorite } from '@/services/db/locations';
import { useSession } from '@/stores/session';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { Divider, Panel, SectionTitle } from '@/ui/Panel';
import { cn } from '@/ui/cn';
import { LocationIllustration } from './LocationIllustration';
import { LocationPicker } from './LocationPicker';

export function ExplorationPage() {
  const campaign = useActiveCampaign();
  const { location, path, loading } = useCurrentPlace();
  const { immersive, setImmersive, setDiceOpen } = useSession();
  const [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();

  // En mode immersion, le bouton de sortie s'efface après quelques secondes ; un toucher le fait revenir.
  const [chromeVisible, setChromeVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const wake = () => {
    setChromeVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setChromeVisible(false), 3500);
  };
  useEffect(() => {
    if (immersive) wake();
    return () => window.clearTimeout(timer.current);
  }, [immersive]);
  useEffect(() => () => setImmersive(false), [setImmersive]);

  if (loading) return null;

  if (!campaign || !location) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Panel ornate className="max-w-lg px-8 py-8 text-center">
          <h1 className="font-display text-2xl text-ink-900">Aucun lieu sélectionné</h1>
          <p className="mt-2 text-lg text-ink-700">Choisissez où se trouve votre personnage.</p>
          <Button variant="primary" className="mt-5" onClick={() => setPickerOpen(true)}>
            Choisir un lieu
          </Button>
        </Panel>
        {campaign && (
          <LocationPicker open={pickerOpen} onClose={() => setPickerOpen(false)} campaignId={campaign.id} currentPath={[]} />
        )}
      </div>
    );
  }

  const ancestors = path.slice(0, -1);

  if (immersive) {
    return (
      <div className="fixed inset-0 z-30 bg-black" onPointerDown={wake}>
        <LocationIllustration location={location} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-10 pt-24 pb-8">
          <p className="font-display text-sm uppercase tracking-[0.25em] text-parchment-300">
            {ancestors.map((a) => a.name).join(' · ')}
          </p>
          <h1 className="font-display text-4xl font-semibold text-parchment-50 text-engraved">{location.name}</h1>
        </div>
        <div className={cn('absolute right-5 top-5 transition-opacity duration-500', chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <Button variant="secondary" icon={<Minimize className="size-5" />} onClick={() => setImmersive(false)} className="bg-leather-950/70 backdrop-blur">
            Quitter l’immersion
          </Button>
        </div>
      </div>
    );
  }

  const shortcuts = [
    { label: 'Carte', icon: Map, run: () => navigate('/carte') },
    { label: 'Dés', icon: Dices, run: () => setDiceOpen(true) },
    { label: 'Fiches', icon: Users, run: () => navigate('/personnages') },
    { label: 'Journal', icon: ScrollText, run: () => navigate('/journal') },
  ];

  return (
    <div className="flex h-full gap-4 p-4 max-md:flex-col max-md:overflow-y-auto">
      {/* Illustration principale */}
      <section className="relative min-h-[50vh] min-w-0 flex-1 overflow-hidden rounded-xl frame-gilt">
        <LocationIllustration location={location} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-7 pt-28 pb-6">
          <p className="font-display text-xs uppercase tracking-[0.25em] text-parchment-300 md:text-sm">
            {ancestors.map((a) => a.name).join(' · ') || LOCATION_KIND_LABELS[location.kind]}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-50 text-engraved lg:text-4xl">
            {location.name}
          </h1>
        </div>
        <div className="absolute right-3 top-3 flex gap-2">
          <IconButton
            label="Mode immersion"
            onClick={() => setImmersive(true)}
            className="bg-leather-950/60 backdrop-blur-sm"
          >
            <Eye className="size-6" />
          </IconButton>
        </div>
      </section>

      {/* Panneau latéral */}
      <aside className="flex w-[310px] shrink-0 flex-col gap-4 lg:w-[360px] max-md:w-full">
        <Panel ornate className="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-5 [@media(max-height:680px)]:pt-4 [@media(max-height:680px)]:pb-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="ink">{LOCATION_KIND_LABELS[location.kind]}</Badge>
                {location.isDemo && <Badge tone="ink">Exemple</Badge>}
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-ink-900">{location.name}</h2>
              {ancestors.length > 0 && <p className="text-base text-ink-500">{ancestors.map((a) => a.name).join(' › ')}</p>}
            </div>
            <IconButton
              tone="light"
              label={location.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              active={location.favorite}
              onClick={() => void toggleFavorite(location.id)}
            >
              <Star className={cn('size-6', location.favorite && 'fill-bronze-500 text-bronze-600')} />
            </IconButton>
          </div>

          <Divider className="my-4 [@media(max-height:680px)]:my-2" />

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
            {location.description ? (
              <p className="text-lg leading-relaxed text-ink-700">{location.description}</p>
            ) : (
              <p className="text-lg italic text-ink-500">Aucune description.</p>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full [@media(max-height:680px)]:mt-3 [@media(max-height:680px)]:h-12"
            onClick={() => setPickerOpen(true)}
          >
            Changer de lieu
          </Button>
        </Panel>

        <Panel tone="leather" className="px-5 py-4 [@media(max-height:680px)]:py-2.5">
          <SectionTitle className="text-bronze-400">Ambiance</SectionTitle>
          <p className="mt-1.5 flex items-center gap-2 text-base italic text-parchment-400">
            <Music className="size-4 shrink-0" /> Lecteur audio prévu en phase 2
          </p>
        </Panel>

        <div className="grid grid-cols-4 gap-2">
          {shortcuts.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={run}
              className="flex h-[72px] [@media(max-height:680px)]:h-16 flex-col items-center justify-center gap-1 rounded-lg border border-bronze-500/35 bg-leather-850/70 text-parchment-200 transition-colors hover:border-bronze-400 hover:text-gold-200 active:scale-[0.97]"
            >
              <Icon className="size-6" strokeWidth={1.6} />
              <span className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em]">{label}</span>
            </button>
          ))}
        </div>
      </aside>

      <LocationPicker open={pickerOpen} onClose={() => setPickerOpen(false)} campaignId={campaign.id} currentPath={path} />
    </div>
  );
}
