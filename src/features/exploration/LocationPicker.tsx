import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Clock, MapPin, Navigation, Star } from 'lucide-react';
import { EASE_OUT } from '@/ui/motion';
import type { Location } from '@/domain/schemas';
import { LOCATION_KIND_LABELS } from '@/domain/schemas';
import { useCampaignLocations } from '@/hooks/data';
import { travelTo } from '@/services/db/campaigns';
import { sortLocations } from '@/services/db/locations';
import { toast } from '@/stores/toasts';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { cn } from '@/ui/cn';

type Tab = 'parcourir' | 'favoris' | 'recents';

/** Les lignes d'une colonne apparaissent en cascade. */
const LIST = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } };
const ROW = { hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } };

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  currentPath: Location[];
}

/**
 * Sélecteur de lieu en trois colonnes (Région › Zone › Lieu) : on choisit
 * n'importe quel lieu en deux ou trois touchers, sans changer d'écran.
 */
export function LocationPicker({ open, onClose, campaignId, currentPath }: Props) {
  const all = useCampaignLocations(campaignId) ?? [];
  const [tab, setTab] = useState<Tab>('parcourir');
  const [col1, setCol1] = useState<string | null>(null);
  const [col2, setCol2] = useState<string | null>(null);
  const currentId = currentPath[currentPath.length - 1]?.id;

  // À l'ouverture, les colonnes se positionnent sur le lieu courant.
  useEffect(() => {
    if (!open) return;
    setCol1(currentPath[0]?.id ?? null);
    setCol2(currentPath[1]?.id ?? null);
  }, [open]); // volontairement : seulement à l'ouverture, pas à chaque déplacement

  const byParent = useMemo(() => {
    const m = new Map<string | null, Location[]>();
    const ids = new Set(all.map((l) => l.id));
    for (const l of all) {
      const parent = l.parentId && ids.has(l.parentId) ? l.parentId : null;
      m.set(parent, [...(m.get(parent) ?? []), l]);
    }
    for (const [k, v] of m) m.set(k, sortLocations(v));
    return m;
  }, [all]);

  const byId = useMemo(() => new Map(all.map((l) => [l.id, l])), [all]);
  const pathLabel = (l: Location) => {
    const names: string[] = [];
    let p = l.parentId ? byId.get(l.parentId) : undefined;
    while (p && names.length < 4) {
      names.unshift(p.name);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return names.join(' › ');
  };

  const go = async (l: Location) => {
    try {
      await travelTo(campaignId, l.id);
      onClose();
    } catch (e) {
      toast({ tone: 'error', title: 'Impossible de se rendre dans ce lieu', message: (e as Error).message });
    }
  };

  const roots = byParent.get(null) ?? [];
  const level2 = col1 ? byParent.get(col1) ?? [] : [];
  const level3 = col2 ? byParent.get(col2) ?? [] : [];
  const favorites = sortLocations(all.filter((l) => l.favorite));
  const recents = all
    .filter((l) => l.lastVisitedAt != null)
    .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
    .slice(0, 12);

  const row = (l: Location, opts: { selected?: boolean; onOpen?: () => void; showPath?: boolean }) => {
    const hasChildren = (byParent.get(l.id) ?? []).length > 0;
    const isCurrent = l.id === currentId;
    const openable = hasChildren && opts.onOpen;
    return (
      <motion.li key={l.id} variants={ROW} transition={{ duration: 0.3, ease: EASE_OUT }} className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => (openable ? opts.onOpen!() : void go(l))}
          className={cn(
            'flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.98]',
            opts.selected
              ? 'border-gold-300/60 bg-gold-300/12 text-gold-200'
              : 'border-transparent text-parchment-100 hover:border-bronze-500/30 hover:bg-parchment-100/5',
          )}
        >
          {isCurrent ? (
            <MapPin className="size-5 shrink-0 text-gold-300" />
          ) : l.favorite ? (
            <Star className="size-5 shrink-0 text-bronze-400" />
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg leading-tight">{l.name}</span>
            <span className="block truncate text-sm text-parchment-400">
              {opts.showPath ? pathLabel(l) || LOCATION_KIND_LABELS[l.kind] : LOCATION_KIND_LABELS[l.kind]}
            </span>
          </span>
          {openable && <ChevronRight className="size-5 shrink-0 text-parchment-400" />}
        </button>
        {openable && (
          <button
            type="button"
            onClick={() => void go(l)}
            aria-label={`Se rendre : ${l.name}`}
            title="S’y rendre"
            className={cn(
              'flex w-14 shrink-0 items-center justify-center rounded-lg border transition-colors',
              isCurrent
                ? 'border-gold-300/50 text-gold-300'
                : 'border-bronze-500/30 text-parchment-300 hover:border-bronze-400 hover:text-gold-200',
            )}
          >
            <Navigation className="size-5" />
          </button>
        )}
      </motion.li>
    );
  };

  const column = (title: string, items: Location[], render: (l: Location) => React.ReactNode, empty: string) => (
    <section className="flex min-h-0 flex-col">
      <h3 className="px-2 pb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-bronze-400">{title}</h3>
      <motion.ul
        key={items.map((i) => i.id).join(',') || empty}
        variants={LIST}
        initial="hidden"
        animate="show"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-thin"
      >
        {items.length ? (
          items.map(render)
        ) : (
          <motion.li variants={ROW} className="px-2 py-3 text-base italic text-parchment-400">
            {empty}
          </motion.li>
        )}
      </motion.ul>
    </section>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Changer de lieu"
      subtitle="Touchez une région ou une ville pour l’ouvrir, puis un lieu pour vous y rendre. Le bouton ➤ permet de s’arrêter dans une région ou une ville."
      sizeClass="w-[min(1040px,96vw)]"
    >
      <div className="flex h-full flex-col gap-4 px-5 py-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'parcourir', label: 'Parcourir' },
            { value: 'favoris', label: `Favoris (${favorites.length})` },
            { value: 'recents', label: 'Récents' },
          ]}
        />

        {tab === 'parcourir' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
            {column(
              'Régions',
              roots,
              (l) =>
                row(l, {
                  selected: l.id === col1,
                  onOpen: () => {
                    setCol1(l.id);
                    setCol2(null);
                  },
                }),
              'Aucune région.',
            )}
            {column(
              'Villes et zones',
              level2,
              (l) => row(l, { selected: l.id === col2, onOpen: () => setCol2(l.id) }),
              col1 ? 'Aucune zone dans cette région.' : 'Choisissez une région.',
            )}
            {column(
              'Lieux',
              level3,
              (l) => row(l, {}),
              col2 ? 'Aucun lieu enregistré ici.' : 'Choisissez une ville ou une zone.',
            )}
          </div>
        )}

        {tab === 'favoris' && (
          <motion.ul variants={LIST} initial="hidden" animate="show" className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-thin">
            {favorites.length ? (
              favorites.map((l) => row(l, { showPath: true }))
            ) : (
              <li className="px-2 py-3 text-lg italic text-parchment-400">
                Aucun favori. Touchez l’étoile d’un lieu sur l’écran Exploration pour l’ajouter.
              </li>
            )}
          </motion.ul>
        )}

        {tab === 'recents' && (
          <motion.ul variants={LIST} initial="hidden" animate="show" className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-thin">
            {recents.length ? (
              recents.map((l) => (
                <motion.div key={l.id} variants={ROW} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">{row(l, { showPath: true })}</div>
                  <span className="flex shrink-0 items-center gap-1 pr-2 text-sm text-parchment-400">
                    <Clock className="size-4" />
                    {new Date(l.lastVisitedAt!).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </motion.div>
              ))
            ) : (
              <li className="px-2 py-3 text-lg italic text-parchment-400">Aucun lieu visité pour l’instant.</li>
            )}
          </motion.ul>
        )}
      </div>
    </Sheet>
  );
}
