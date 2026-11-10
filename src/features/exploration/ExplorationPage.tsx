import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Dices, Eye, Map, Minimize, Pencil, Plus, ScrollText, Star, Users } from 'lucide-react';
import { LOCATION_KIND_LABELS, MAX_LOCATION_DEPTH, type Location } from '@/domain/schemas';
import { useActiveCampaign, useCurrentPlace } from '@/hooks/data';
import { toggleFavorite } from '@/services/db/locations';
import { useIsPrep, useSession } from '@/stores/session';
import { AmbiancePanel } from '@/features/audio/AmbiancePanel';
import { LocationEditor, type LocationEditorTarget } from '@/features/locations/LocationEditor';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { Divider, Panel } from '@/ui/Panel';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { LocationIllustration } from './LocationIllustration';
import { LocationPicker } from './LocationPicker';

/** Titre cinématographique posé sur l'illustration ; il apparaît après le fondu de l'image. */
function SceneTitle({ location, ancestors, large }: { location: Location; ancestors: Location[]; large?: boolean }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.id}
        initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: 0.3 } }}
        transition={{ duration: 0.8, delay: 0.45, ease: EASE_OUT }}
      >
        <p className={cn('font-display uppercase tracking-[0.25em] text-parchment-300', large ? 'text-sm' : 'text-xs md:text-sm')}>
          {ancestors.map((a) => a.name).join(' · ') || LOCATION_KIND_LABELS[location.kind]}
        </p>
        <h1
          className={cn(
            'mt-1 font-display font-semibold text-parchment-50 text-engraved',
            large ? 'text-4xl lg:text-5xl' : 'text-3xl lg:text-4xl',
          )}
        >
          {location.name}
        </h1>
      </motion.div>
    </AnimatePresence>
  );
}

function ImmersiveView({ location, ancestors, onExit }: { location: Location; ancestors: Location[]; onExit: () => void }) {
  // Le bouton de sortie s'efface après quelques secondes ; un toucher le fait revenir.
  const [chromeVisible, setChromeVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const wake = () => {
    setChromeVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setChromeVisible(false), 3500);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(timer.current);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-30 bg-black"
      onPointerDown={wake}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      <LocationIllustration location={location} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-10 pt-28 pb-9">
        <SceneTitle location={location} ancestors={ancestors} large />
      </div>
      <motion.div
        className="absolute right-5 top-5"
        animate={{ opacity: chromeVisible ? 1 : 0, y: chromeVisible ? 0 : -8 }}
        transition={{ duration: 0.5 }}
        style={{ pointerEvents: chromeVisible ? 'auto' : 'none' }}
      >
        <Button variant="secondary" icon={<Minimize className="size-5" />} onClick={onExit} className="bg-leather-950/70 backdrop-blur">
          Quitter l’immersion
        </Button>
      </motion.div>
    </motion.div>
  );
}

export function ExplorationPage() {
  const campaign = useActiveCampaign();
  const { location, path, loading } = useCurrentPlace();
  const { immersive, setImmersive, setDiceOpen } = useSession();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editor, setEditor] = useState<LocationEditorTarget | null>(null);
  const isPrep = useIsPrep();
  const navigate = useNavigate();
  const openFromPicker = (t: LocationEditorTarget) => {
    setPickerOpen(false);
    setEditor(t);
  };

  useEffect(() => () => setImmersive(false), [setImmersive]);

  if (loading) return null;

  if (!campaign || !location) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Panel ornate className="max-w-lg px-8 py-8 text-center">
          <h1 className="font-display text-2xl text-ink-900">Aucun lieu sélectionné</h1>
          <p className="mt-2 text-lg text-ink-700">Choisissez où se trouve votre personnage.</p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="primary" onClick={() => setPickerOpen(true)}>
              Choisir un lieu
            </Button>
            {isPrep && (
              <Button variant="ink" icon={<Plus className="size-5" />} onClick={() => setEditor({ id: null, parentId: null })}>
                Créer un lieu
              </Button>
            )}
          </div>
        </Panel>
        {campaign && (
          <>
            <LocationPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              campaignId={campaign.id}
              currentPath={[]}
              onEdit={isPrep ? openFromPicker : undefined}
            />
            <LocationEditor campaignId={campaign.id} target={isPrep ? editor : null} onClose={() => setEditor(null)} />
          </>
        )}
      </div>
    );
  }

  const ancestors = path.slice(0, -1);
  const shortcuts = [
    { label: 'Carte', icon: Map, run: () => navigate('/carte') },
    { label: 'Dés', icon: Dices, run: () => setDiceOpen(true) },
    { label: 'Fiches', icon: Users, run: () => navigate('/personnages') },
    { label: 'Journal', icon: ScrollText, run: () => navigate('/journal') },
  ];

  return (
    <div className="flex h-full gap-4 p-4 max-md:flex-col max-md:overflow-y-auto">
      {/* Illustration principale */}
      <motion.section
        className="relative min-h-[50vh] min-w-0 flex-1 overflow-hidden rounded-xl frame-gilt"
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      >
        <LocationIllustration location={location} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-7 pt-28 pb-6">
          <SceneTitle location={location} ancestors={ancestors} />
        </div>
        <div className="absolute right-3 top-3 flex gap-2">
          <IconButton label="Mode immersion" onClick={() => setImmersive(true)} className="bg-leather-950/50 backdrop-blur-sm">
            <Eye className="size-6" />
          </IconButton>
        </div>
      </motion.section>

      {/* Panneau latéral */}
      <motion.aside
        className="flex w-[310px] shrink-0 flex-col gap-4 lg:w-[360px] max-md:w-full"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
      >
        <Panel ornate className="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-5 [@media(max-height:680px)]:pt-4 [@media(max-height:680px)]:pb-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.id}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="ink">{LOCATION_KIND_LABELS[location.kind]}</Badge>
                    {location.isDemo && <Badge tone="ink">Exemple</Badge>}
                  </div>
                  <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-ink-900">{location.name}</h2>
                  {ancestors.length > 0 && <p className="text-base text-ink-500">{ancestors.map((a) => a.name).join(' › ')}</p>}
                </div>
                {isPrep && (
                  <IconButton tone="light" label="Modifier ce lieu" onClick={() => setEditor({ id: location.id })}>
                    <Pencil className="size-5" />
                  </IconButton>
                )}
                <IconButton
                  tone="light"
                  label={location.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  active={location.favorite}
                  onClick={() => void toggleFavorite(location.id)}
                >
                  <motion.span
                    key={String(location.favorite)}
                    initial={{ scale: 0.4, rotate: -40 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 14 }}
                    className="inline-flex"
                  >
                    <Star className={cn('size-6', location.favorite && 'fill-bronze-500 text-bronze-600')} />
                  </motion.span>
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
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 flex gap-2 [@media(max-height:680px)]:mt-3">
            <Button
              variant="primary"
              size="lg"
              className="flex-1 [@media(max-height:680px)]:h-12"
              onClick={() => setPickerOpen(true)}
            >
              Changer de lieu
            </Button>
            {isPrep && (
              <Button
                variant="ink"
                size="lg"
                className="px-4 [@media(max-height:680px)]:h-12"
                title={path.length >= MAX_LOCATION_DEPTH ? 'Ajouter un lieu voisin' : 'Ajouter un lieu à l’intérieur'}
                aria-label="Ajouter un lieu"
                onClick={() =>
                  setEditor({ id: null, parentId: path.length >= MAX_LOCATION_DEPTH ? location.parentId : location.id })
                }
              >
                <Plus className="size-6" />
              </Button>
            )}
          </div>
        </Panel>

        <AmbiancePanel />

        <div className="grid grid-cols-4 gap-2">
          {shortcuts.map(({ label, icon: Icon, run }, i) => (
            <motion.button
              key={label}
              type="button"
              onClick={run}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.05, ease: EASE_OUT }}
              className="tile-lift flex h-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-bronze-500/35 bg-leather-850/70 text-parchment-200 hover:border-bronze-400 hover:text-gold-200 [@media(max-height:680px)]:h-16"
            >
              <Icon className="size-6" strokeWidth={1.6} />
              <span className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em]">{label}</span>
            </motion.button>
          ))}
        </div>
      </motion.aside>

      <LocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        campaignId={campaign.id}
        currentPath={path}
        onEdit={isPrep ? openFromPicker : undefined}
      />
      <LocationEditor campaignId={campaign.id} target={isPrep ? editor : null} onClose={() => setEditor(null)} />

      <AnimatePresence>
        {immersive && <ImmersiveView location={location} ancestors={ancestors} onExit={() => setImmersive(false)} />}
      </AnimatePresence>
    </div>
  );
}
