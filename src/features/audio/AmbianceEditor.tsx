import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Headphones, Music, Pause, Play, Plus, Repeat, Shuffle, Square, Trash2, Upload, Waves } from 'lucide-react';
import {
  AMBIANCE_CATEGORIES,
  AUDIO_BUS_LABELS,
  type Ambiance,
  type AmbianceLayer,
  type MediaMeta,
} from '@/domain/schemas';
import { newLayer, saveAmbiance } from '@/services/db/ambiances';
import { db } from '@/services/db/database';
import { AUDIO_ACCEPT, formatDuration } from '@/services/media/audio';
import { unlockAudio, useAudio } from '@/stores/audio';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { Field, Select, Slider, TextInput } from '@/ui/Field';
import { SectionTitle } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { importSounds } from './importSounds';
import { usePreview } from './preview';
import { useCampaignSounds } from './useAmbianceDirector';

/** Réglage par défaut d'une nouvelle couche selon la durée du son. */
function layerFor(sound: MediaMeta): AmbianceLayer {
  const d = sound.duration ?? 60;
  if (d < 10) return { ...newLayer(sound.id, 'sfx', false), intervalMin: 15, intervalMax: 45 };
  return newLayer(sound.id, d > 90 ? 'music' : 'sfx', true);
}

function LayerRow({
  layer,
  sound,
  onChange,
  onRemove,
}: {
  layer: AmbianceLayer;
  sound: MediaMeta | undefined;
  onChange: (l: AmbianceLayer) => void;
  onRemove: () => void;
}) {
  const { playingId, toggle } = usePreview();
  const BusIcon = layer.bus === 'music' ? Music : Waves;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="rounded-lg border border-bronze-500/30 bg-leather-950/40 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <BusIcon className="size-5 shrink-0 text-bronze-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg text-parchment-50">{sound?.name ?? 'Son manquant'}</p>
          <p className="text-sm text-parchment-400">{formatDuration(sound?.duration)}</p>
        </div>
        {sound && (
          <IconButton label="Écouter ce son seul" active={playingId === sound.id} onClick={() => void toggle(sound.id)}>
            {playingId === sound.id ? <Pause className="size-5" /> : <Play className="size-5" />}
          </IconButton>
        )}
        <IconButton label="Retirer cette couche" onClick={onRemove} className="hover:text-blood-500">
          <Trash2 className="size-5" />
        </IconButton>
      </div>

      <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
        <div className="col-span-3 flex flex-wrap gap-2">
          <Select
            value={layer.bus}
            onChange={(e) => onChange({ ...layer, bus: e.target.value as AmbianceLayer['bus'] })}
            className="h-11 w-auto text-base"
            aria-label="Type de son"
          >
            {Object.entries(AUDIO_BUS_LABELS).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
          <div className="flex overflow-hidden rounded-md border border-bronze-500/35">
            {[
              { loop: true, label: 'En boucle', icon: Repeat },
              { loop: false, label: 'Ponctuel', icon: Shuffle },
            ].map(({ loop, label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => onChange({ ...layer, loop })}
                className={cn(
                  'flex h-11 items-center gap-2 px-3 text-base transition-colors',
                  layer.loop === loop ? 'bg-gold-300/15 text-gold-200' : 'text-parchment-300 hover:bg-parchment-100/5',
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-base text-parchment-300">Volume</span>
        <Slider label="Volume de la couche" value={layer.volume} onChange={(volume) => onChange({ ...layer, volume })} />
        <span className="w-9 text-right text-base tabular-nums text-parchment-300">{Math.round(layer.volume * 100)}</span>
      </div>

      <AnimatePresence initial={false}>
        {!layer.loop && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-parchment-300">
              Rejoué toutes les
              <TextInput
                type="number"
                min={1}
                max={3600}
                value={layer.intervalMin}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(3600, Number(e.target.value) || 1));
                  onChange({ ...layer, intervalMin: v, intervalMax: Math.max(v, layer.intervalMax) });
                }}
                className="h-11 w-20 text-center"
                aria-label="Intervalle minimum en secondes"
              />
              à
              <TextInput
                type="number"
                min={1}
                max={3600}
                value={layer.intervalMax}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(3600, Number(e.target.value) || 1));
                  onChange({ ...layer, intervalMax: v, intervalMin: Math.min(v, layer.intervalMin) });
                }}
                className="h-11 w-20 text-center"
                aria-label="Intervalle maximum en secondes"
              />
              secondes, au hasard
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * Éditeur d'ambiance (mode Préparation). Les modifications sont enregistrées
 * automatiquement : en écoute, chaque réglage s'entend aussitôt.
 */
export function AmbianceEditor({ ambianceId, onClose }: { ambianceId: string | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Ambiance | null>(null);
  const [adding, setAdding] = useState(false);
  const sounds = useCampaignSounds(draft?.campaignId) ?? [];
  const byId = new Map(sounds.map((s) => [s.id, s]));
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Ambiance | null>(null);
  const { override, setOverride, unlocked } = useAudio();
  const listening = typeof override === 'object' && override?.ambianceId === ambianceId;

  useEffect(() => {
    setAdding(false);
    if (!ambianceId) return;
    setDraft(null);
    void db.ambiances.get(ambianceId).then((a) => setDraft(a ?? null));
  }, [ambianceId]);

  const flush = () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) {
      void saveAmbiance(p).catch((e: Error) => toast({ tone: 'error', title: 'Enregistrement impossible', message: e.message }));
    }
  };

  const update = (next: Ambiance) => {
    setDraft(next);
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 250);
  };

  const close = () => {
    if (draft && !draft.name.trim()) update({ ...draft, name: 'Ambiance sans nom' });
    flush();
    usePreview.getState().stop();
    onClose();
  };

  const addSound = (s: MediaMeta) => {
    if (!draft) return;
    update({ ...draft, layers: [...draft.layers, layerFor(s)] });
    setAdding(false);
  };

  const categories = draft && !AMBIANCE_CATEGORIES.includes(draft.category) ? [draft.category, ...AMBIANCE_CATEGORIES] : AMBIANCE_CATEGORIES;

  return (
    <Sheet
      open={!!ambianceId && !!draft}
      onClose={close}
      title="Modifier l’ambiance"
      subtitle="Enregistrement automatique. Écoutez pendant que vous réglez."
      sizeClass="w-[min(680px,96vw)]"
      footer={
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            variant={listening ? 'secondary' : 'primary'}
            icon={listening ? <Square className="size-5" /> : <Headphones className="size-5" />}
            onClick={() => {
              if (listening) setOverride(null);
              else {
                if (!unlocked) void unlockAudio();
                flush();
                setOverride({ ambianceId: ambianceId! });
              }
            }}
          >
            {listening ? 'Arrêter l’écoute' : 'Écouter cette ambiance'}
          </Button>
          <Button variant="secondary" onClick={close}>
            Terminé
          </Button>
        </div>
      }
    >
      {draft && (
        <div className="space-y-5 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Field label="Nom">
              <TextInput value={draft.name} maxLength={200} onChange={(e) => update({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Catégorie">
              <Select value={draft.category} onChange={(e) => update({ ...draft, category: e.target.value })}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle className="text-bronze-400">Couches ({draft.layers.length})</SectionTitle>
              <span className="text-sm text-parchment-400">Jouées toutes en même temps</span>
            </div>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {draft.layers.map((l) => (
                  <LayerRow
                    key={l.id}
                    layer={l}
                    sound={byId.get(l.mediaId)}
                    onChange={(nl) => update({ ...draft, layers: draft.layers.map((x) => (x.id === l.id ? nl : x)) })}
                    onRemove={() => update({ ...draft, layers: draft.layers.filter((x) => x.id !== l.id) })}
                  />
                ))}
              </AnimatePresence>
            </ul>
            {draft.layers.length === 0 && (
              <p className="rounded-lg border border-dashed border-bronze-500/30 px-4 py-4 text-base italic text-parchment-400">
                Une ambiance réunit plusieurs sons : par exemple une musique douce, un feu qui crépite en boucle et le
                brouhaha d’une salle, avec un rire de temps en temps.
              </p>
            )}

            <div className="mt-3">
              <AnimatePresence initial={false} mode="wait">
                {adding ? (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="rounded-lg border border-bronze-500/35 bg-leather-950/40 p-2"
                  >
                    <div className="mb-1 flex items-center justify-between px-2">
                      <span className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">
                        Choisir dans la bibliothèque
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                        Annuler
                      </Button>
                    </div>
                    <ul className="max-h-64 space-y-1 overflow-y-auto scrollbar-thin">
                      {[...sounds]
                        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                        .map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => addSound(s)}
                              className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-parchment-100 hover:bg-parchment-100/8"
                            >
                              <Plus className="size-4 text-bronze-400" />
                              <span className="min-w-0 flex-1 truncate text-lg">{s.name}</span>
                              <span className="text-sm text-parchment-400">{formatDuration(s.duration)}</span>
                            </button>
                          </li>
                        ))}
                      {sounds.length === 0 && <li className="px-3 py-2 italic text-parchment-400">La bibliothèque est vide.</li>}
                    </ul>
                  </motion.div>
                ) : (
                  <motion.div key="buttons" className="flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Button icon={<Plus className="size-5" />} onClick={() => setAdding(true)} disabled={sounds.length === 0}>
                      Ajouter un son
                    </Button>
                    <Button icon={<Upload className="size-5" />} onClick={() => input.current?.click()}>
                      Importer et ajouter
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <input
                ref={input}
                type="file"
                accept={AUDIO_ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files?.length || !draft) return;
                  void importSounds(draft.campaignId, files).then((added) => {
                    e.target.value = '';
                    if (added.length) {
                      setDraft((d) => {
                        if (!d) return d;
                        const next = { ...d, layers: [...d.layers, ...added.map(layerFor)] };
                        pending.current = next;
                        window.clearTimeout(timer.current);
                        timer.current = window.setTimeout(flush, 50);
                        return next;
                      });
                    }
                  });
                }}
              />
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
