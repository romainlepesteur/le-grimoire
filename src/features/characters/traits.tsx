import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, History, Minus, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { newId } from '@/domain/ids';
import { formatMod, traitIsActive } from '@/domain/checks';
import type { Character, Rules, Trait, TraitEffect } from '@/domain/schemas';
import { adjustTraitUses, deleteTrait, newTrait, saveTrait, setTraitState } from '@/services/db/play';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';

const encodeTarget = (e: Pick<TraitEffect, 'target' | 'targetId'>) => (e.target === 'ability' || e.target === 'skill' ? `${e.target}:${e.targetId}` : e.target);
function decodeTarget(v: string): Pick<TraitEffect, 'target' | 'targetId'> {
  const [t, id] = v.split(':');
  return t === 'ability' || t === 'skill' ? { target: t, targetId: id ?? null } : { target: t as TraitEffect['target'], targetId: null };
}

export function effectLabel(e: TraitEffect, rules: Rules): string {
  const what =
    e.target === 'ability'
      ? (rules.abilities.find((a) => a.id === e.targetId)?.name ?? 'Caractéristique supprimée')
      : e.target === 'skill'
        ? (rules.skills.find((s) => s.id === e.targetId)?.name ?? 'Compétence supprimée')
        : e.target === 'all_checks'
          ? 'tous les jets'
          : 'points de chance (maximum)';
  return `${formatMod(e.value)} ${what}`;
}

/** Couleur de l'état : latent = brumeux, actif = vivant, maîtrisé = doré. */
function stateTone(stateId: string, active: boolean) {
  if (stateId === 'latent') return 'border-parchment-300/30 bg-parchment-100/5 text-parchment-300 italic';
  if (stateId === 'maitrise') return 'border-gold-300/70 bg-gold-300/15 text-gold-200';
  return active ? 'border-forest-500/70 bg-forest-700/30 text-parchment-50' : 'border-bronze-500/40 bg-bronze-500/10 text-parchment-200';
}

function TraitEditor({ characterId, trait, isNew, rules, onClose }: { characterId: string; trait: Trait | null; isNew: boolean; rules: Rules; onClose: () => void }) {
  const [draft, setDraft] = useState<Trait | null>(trait);
  const [last, setLast] = useState(trait);
  if (trait !== last) {
    setLast(trait);
    setDraft(trait);
  }
  const set = <K extends keyof Trait>(k: K, v: Trait[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const stateName = (id: string) => rules.traitStates.find((s) => s.id === id)?.name ?? id;
  const targets = [
    ...rules.abilities.map((a) => ({ v: `ability:${a.id}`, label: `Caractéristique : ${a.name}` })),
    ...rules.skills.map((s) => ({ v: `skill:${s.id}`, label: `Compétence : ${s.name}` })),
    { v: 'all_checks', label: 'Tous les jets' },
    { v: 'luck_max', label: 'Points de chance (maximum)' },
  ];

  return (
    <Sheet
      open={!!trait}
      onClose={onClose}
      title={trait?.name || 'Nouveau trait'}
      subtitle="Saisi à la main : l’application n’invente aucun pouvoir et ne révèle rien."
      sizeClass="w-[min(640px,96vw)]"
      footer={
        <div className="flex gap-3">
          <Button
            variant="ghost"
            icon={<Trash2 className="size-5" />}
            className="hover:text-blood-500"
            disabled={isNew}
            onClick={() => {
              if (!trait) return;
              onClose();
              void deleteTrait(characterId, trait.id).then((removed) => {
                if (removed) toast({ tone: 'success', title: `${removed.name} supprimé`, action: { label: 'Annuler', run: () => void saveTrait(characterId, removed) } });
              });
            }}
          >
            Supprimer
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!draft?.name.trim()}
            onClick={() => {
              if (!draft) return;
              // Un changement d'état fait depuis l'éditeur est aussi noté dans l'évolution.
              const changed = !isNew && trait && trait.stateId !== draft.stateId;
              const next = changed ? { ...draft, history: [...draft.history, { at: Date.now(), stateId: draft.stateId, note: '' }] } : draft;
              void saveTrait(characterId, next)
                .then(onClose)
                .catch((e: Error) => toast({ tone: 'error', title: 'Enregistrement impossible', message: e.message }));
            }}
          >
            Enregistrer
          </Button>
        </div>
      }
    >
      {draft && (
        <div className="space-y-4 px-5 py-4">
          <Field label="Nom">
            <TextInput value={draft.name} maxLength={120} placeholder="Ex. : Héritage des Valdoren" onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={draft.kindId} onChange={(e) => set('kindId', e.target.value)}>
                {rules.traitKinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="État" hint={rules.traitStates.find((s) => s.id === draft.stateId)?.effects ? 'Les effets s’appliquent.' : 'Les effets ne s’appliquent pas dans cet état.'}>
              <Select value={draft.stateId} onChange={(e) => set('stateId', e.target.value)}>
                {rules.traitStates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" hint="Seulement ce que le personnage sait. Le MJ décide de la suite.">
            <TextArea rows={5} value={draft.description} maxLength={10000} placeholder="Ce que l’on en sait pour l’instant…" onChange={(e) => set('description', e.target.value)} />
          </Field>

          <section>
            <span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">Effets mécaniques (facultatif)</span>
            <ul className="space-y-1.5">
              {draft.effects.map((e, i) => (
                <li key={e.id} className="flex gap-2">
                  <Select
                    value={encodeTarget(e)}
                    onChange={(ev) => set('effects', draft.effects.map((x, j) => (j === i ? { ...x, ...decodeTarget(ev.target.value) } : x)))}
                    className="h-11 flex-1 text-base"
                    aria-label="Ce qui est modifié"
                  >
                    {targets.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    inputMode="numeric"
                    value={e.value}
                    aria-label="Valeur"
                    onChange={(ev) => {
                      const n = parseInt(ev.target.value.replace('−', '-'), 10);
                      set('effects', draft.effects.map((x, j) => (j === i ? { ...x, value: Number.isFinite(n) ? Math.max(-50, Math.min(50, n)) : 0 } : x)));
                    }}
                    className="h-11 w-20 text-center"
                  />
                  <IconButton label="Retirer l’effet" onClick={() => set('effects', draft.effects.filter((_, j) => j !== i))}>
                    <Trash2 className="size-5" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="size-4" />}
              className="mt-1"
              onClick={() => set('effects', [...draft.effects, { id: newId('effect'), target: 'all_checks', targetId: null, value: 1 }])}
            >
              Ajouter un effet
            </Button>
          </section>

          <section className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 items-center gap-3 text-lg text-parchment-100">
              <input
                type="checkbox"
                className="size-6 accent-[var(--color-gold-300)]"
                checked={!!draft.uses}
                onChange={(e) => set('uses', e.target.checked ? { current: 1, max: 1 } : null)}
              />
              Utilisations limitées
            </label>
            {draft.uses && (
              <label className="flex items-center gap-2 text-base text-parchment-300">
                Maximum
                <TextInput
                  inputMode="numeric"
                  value={draft.uses.max}
                  onChange={(e) => {
                    const max = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1));
                    set('uses', { max, current: Math.min(max, draft.uses!.current) });
                  }}
                  className="h-11 w-20 text-center"
                  aria-label="Nombre maximum d’utilisations"
                />
              </label>
            )}
          </section>

          {draft.history.length > 0 && (
            <section>
              <span className="mb-1.5 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">
                <History className="size-4" /> Évolution
              </span>
              <ol className="space-y-1 border-l border-bronze-500/30 pl-3">
                {draft.history.map((h, i) => (
                  <li key={i} className="text-base text-parchment-300">
                    <span className="text-parchment-400">{new Date(h.at).toLocaleDateString('fr-FR', { dateStyle: 'medium' })} — </span>
                    {stateName(h.stateId)}
                    {h.note && <span className="italic"> : {h.note}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function TraitCard({ character, trait, rules, light, onEdit }: { character: Character; trait: Trait; rules: Rules; light?: boolean; onEdit: () => void }) {
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);
  const active = traitIsActive(trait, rules);
  const kind = rules.traitKinds.find((k) => k.id === trait.kindId)?.name ?? 'Trait';
  const state = rules.traitStates.find((s) => s.id === trait.stateId)?.name ?? trait.stateId;
  const latent = trait.stateId === 'latent';

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border px-3.5 py-3',
          light ? 'border-ink-700/20 bg-parchment-50/40' : 'border-bronze-500/30 bg-leather-950/40',
          latent && 'border-dashed',
        )}
      >
        {/* Un trait latent est voilé d'une brume discrète. */}
        {latent && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgb(160_150_190/0.14),transparent_60%)] animate-mist-a" />}
        <div className="relative flex items-start gap-2">
          <Sparkles className={cn('mt-1 size-5 shrink-0', active ? (light ? 'text-bronze-700' : 'text-gold-300') : light ? 'text-ink-500/60' : 'text-parchment-400/60')} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('font-display text-lg font-semibold', light ? 'text-ink-900' : 'text-parchment-50')}>{trait.name}</span>
              <span className={cn('text-sm', light ? 'text-ink-500' : 'text-parchment-400')}>· {kind}</span>
              <button type="button" onClick={() => setChanging((v) => !v)} className={cn('flex h-8 items-center gap-1 rounded-full border px-3 text-sm', stateTone(trait.stateId, active))} title="Changer l’état">
                {state} <ChevronDown className="size-3.5" />
              </button>
            </div>
            {trait.description && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className={cn('mt-1 block w-full whitespace-pre-line text-left text-base leading-relaxed', light ? 'text-ink-700' : 'text-parchment-200', !expanded && 'line-clamp-2')}>
                {trait.description}
              </button>
            )}
            {trait.effects.length > 0 && (
              <p className={cn('mt-1 text-sm', active ? (light ? 'text-forest-700' : 'text-forest-500') : light ? 'text-ink-500' : 'text-parchment-400')}>
                {trait.effects.map((e) => effectLabel(e, rules)).join(' · ')}
                {!active && ' — sans effet dans cet état'}
              </p>
            )}
          </div>
          {trait.uses && (
            <div className="flex items-center">
              <IconButton tone={light ? 'light' : 'dark'} label="Une utilisation" onClick={() => void adjustTraitUses(character.id, trait.id, -1)} disabled={trait.uses.current <= 0}>
                <Minus className="size-4" />
              </IconButton>
              <span className={cn('min-w-12 text-center font-display text-base tabular-nums', light ? 'text-ink-900' : 'text-parchment-50')}>
                {trait.uses.current}/{trait.uses.max}
              </span>
              <IconButton tone={light ? 'light' : 'dark'} label="Récupérer une utilisation (si le MJ l’accorde)" onClick={() => void adjustTraitUses(character.id, trait.id, 1)} disabled={trait.uses.current >= trait.uses.max}>
                <Plus className="size-4" />
              </IconButton>
            </div>
          )}
          <IconButton tone={light ? 'light' : 'dark'} label="Modifier le trait" onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
        </div>

        <AnimatePresence initial={false}>
          {changing && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden">
              <div className="space-y-2 pt-3">
                <input
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ce qui s’est passé (facultatif) : « une lueur au contact de l’autel »…"
                  className={cn(
                    'h-11 w-full rounded-md border px-3 text-base outline-none',
                    light ? 'border-ink-700/30 bg-parchment-50/70 text-ink-900' : 'border-bronze-500/35 bg-leather-950/60 text-parchment-50',
                  )}
                  aria-label="Note sur l’évolution"
                />
                <div className="flex flex-wrap gap-1.5">
                  {rules.traitStates.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={s.id === trait.stateId}
                      onClick={() => {
                        void setTraitState(character.id, trait.id, s.id, note).then(() => toast({ tone: 'success', title: `${trait.name} : ${s.name.toLowerCase()}` }));
                        setChanging(false);
                        setNote('');
                      }}
                      className={cn('h-10 rounded-full border px-3.5 text-base disabled:opacity-40', stateTone(s.id, s.effects))}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

/** Traits, aptitudes, particularités, héritages, spécialisations, capacités magiques. */
export function TraitsSection({ character, rules, light }: { character: Character; rules: Rules; light?: boolean }) {
  const [editing, setEditing] = useState<Trait | null>(null);
  return (
    <div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {character.traits.map((t) => (
            <TraitCard key={t.id} character={character} trait={t} rules={rules} light={light} onEdit={() => setEditing(t)} />
          ))}
        </AnimatePresence>
      </ul>
      {!character.traits.length && (
        <p className={cn('text-base italic', light ? 'text-ink-500' : 'text-parchment-400')}>
          Aucun trait. Un héritage encore latent, une aptitude apprise, une particularité… tout se note ici, à la main.
        </p>
      )}
      <Button
        variant={light ? 'ink' : 'secondary'}
        size="sm"
        icon={<Plus className="size-4" />}
        className="mt-2"
        onClick={() => setEditing(newTrait({ name: '', kindId: rules.traitKinds[0]?.id, stateId: rules.traitStates.find((s) => s.effects)?.id ?? rules.traitStates[0]?.id }))}
      >
        Ajouter un trait
      </Button>
      <TraitEditor
        characterId={character.id}
        trait={editing}
        isNew={!!editing && !character.traits.some((t) => t.id === editing.id)}
        rules={rules}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
