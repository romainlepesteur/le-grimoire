import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Backpack, Check, ChevronDown, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { COMPANION_STATUSES, COMPANION_STATUS_LABELS, type Character } from '@/domain/schemas';
import { useActiveCampaign } from '@/hooks/data';
import { createCharacter, deleteCharacter, patchCharacter, restoreCharacter } from '@/services/db/play';
import { toast } from '@/stores/toasts';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { Divider, Panel, SectionTitle } from '@/ui/Panel';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { findPj, useCharacters, useItems } from '@/features/play/hooks';
import { HpControl } from './HpControl';
import { AutoNotes, Coins, Conditions, inputClass, Label, NumberField, Portrait, Stats } from './parts';

const RISE = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

/** Champ texte enregistré à la sortie du champ. */
function InlineText({ value, onCommit, light, className, placeholder, label }: { value: string; onCommit: (v: string) => void; light?: boolean; className?: string; placeholder?: string; label: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={300}
      onBlur={(e) => e.target.value.trim() !== value && onCommit(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={cn(inputClass(light), 'h-11', className)}
    />
  );
}

function useDelete() {
  const [target, setTarget] = useState<Character | null>(null);
  const dialog = (
    <ConfirmDialog
      open={!!target}
      danger
      title={`Supprimer la fiche de ${target?.name ?? ''} ?`}
      message="Ses objets rejoindront le sac commun. Vous pourrez annuler juste après."
      confirmLabel="Supprimer la fiche"
      onCancel={() => setTarget(null)}
      onConfirm={() => {
        const c = target;
        setTarget(null);
        if (!c) return;
        void deleteCharacter(c.id).then((saved) => {
          if (saved) toast({ tone: 'success', title: `Fiche de ${c.name} supprimée`, action: { label: 'Annuler', run: () => void restoreCharacter(saved) } });
        });
      }}
    />
  );
  return { ask: setTarget, dialog };
}

/** Fiche du personnage joueur, sur parchemin. */
function PlayerSheet({ pj, itemCount, onDelete }: { pj: Character; itemCount: number; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  return (
    <Panel ornate className="px-6 pt-6 pb-5">
      <div className="flex items-start gap-4">
        <Portrait character={pj} size="lg" editable={editing} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <InlineText light label="Nom" value={pj.name} onCommit={(name) => name && void patchCharacter(pj.id, { name })} className="font-display text-xl" />
              <InlineText light label="Concept" value={pj.concept} placeholder="Peuple, métier, origine…" onCommit={(concept) => void patchCharacter(pj.id, { concept })} />
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold leading-tight text-ink-900">{pj.name}</h1>
              <p className="text-lg text-ink-700">{pj.concept || <span className="italic text-ink-500">Concept à préciser</span>}</p>
            </>
          )}
        </div>
        <Button variant={editing ? 'primary' : 'ink'} size="sm" icon={editing ? <Check className="size-4" /> : <Pencil className="size-4" />} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Terminé' : 'Modifier'}
        </Button>
      </div>

      <Divider className="my-4" />

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <SectionTitle className="text-bronze-700">Points de vie</SectionTitle>
          {editing && (
            <label className="flex items-center gap-2 text-base text-ink-700">
              Maximum
              <span className="w-20">
                <NumberField light label="Points de vie maximum" value={pj.hpMax} onCommit={(v) => void patchCharacter(pj.id, { hpMax: Math.max(0, Math.round(v)) })} />
              </span>
            </label>
          )}
        </div>
        <HpControl character={pj} light />
      </section>

      <section className="mt-4">
        <Label light>États</Label>
        <Conditions character={pj} light />
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <section>
          <Label light>Caractéristiques</Label>
          <Stats character={pj} editing={editing} light />
        </section>
        <section className="md:w-64">
          <Label light>Bourse</Label>
          <Coins character={pj} light />
          <button
            type="button"
            onClick={() => navigate('/inventaire')}
            className="mt-3 flex h-11 w-full items-center gap-2 rounded-md border border-ink-700/25 px-3 text-base text-ink-700 transition-colors hover:bg-ink-900/5"
          >
            <Backpack className="size-5 text-bronze-700" /> {itemCount} objet{itemCount > 1 ? 's' : ''} porté{itemCount > 1 ? 's' : ''}
          </button>
        </section>
      </div>

      <section className="mt-4">
        <Label light>Notes</Label>
        <AutoNotes character={pj} light rows={5} />
      </section>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 flex justify-end">
              <Button variant="ink" size="sm" icon={<Trash2 className="size-4" />} className="hover:text-blood-600" onClick={onDelete}>
                Supprimer la fiche
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

const STATUS_TONE = { present: 'forest', blesse: 'bronze', parti: 'muted', mort: 'blood' } as const;

/** Compagnon : carte compacte, dépliable. */
function CompanionCard({ c, itemCount, onDelete, index }: { c: Character; itemCount: number; onDelete: () => void; index: number }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <motion.li variants={RISE} transition={{ duration: 0.4, delay: index * 0.04, ease: EASE_OUT }} layout>
      <Panel tone="leather" className={cn('px-4 py-3', (c.status === 'mort' || c.status === 'parti') && 'opacity-75')}>
        <div className="flex items-center gap-3">
          <Portrait character={c} size="sm" editable={editing} />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-lg font-semibold text-parchment-50">{c.name}</span>
              <Badge tone={STATUS_TONE[c.status]}>{COMPANION_STATUS_LABELS[c.status]}</Badge>
            </div>
            <p className="truncate text-sm text-parchment-400">
              {[c.concept, c.relation].filter(Boolean).join(' · ') || 'Touchez pour déplier'} · PV {c.hpCurrent}/{c.hpMax}
            </p>
          </button>
          <IconButton label={open ? 'Replier' : 'Déplier'} onClick={() => setOpen((o) => !o)}>
            <motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-flex">
              <ChevronDown className="size-5" />
            </motion.span>
          </IconButton>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {COMPANION_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void patchCharacter(c.id, { status: s })}
                      className={cn(
                        'h-10 rounded-full border px-3.5 text-base transition-colors',
                        c.status === s ? 'border-gold-300/70 bg-gold-300/15 text-gold-200' : 'border-bronze-500/30 text-parchment-300 hover:text-parchment-100',
                      )}
                    >
                      {COMPANION_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <HpControl character={c} compact />
                <Conditions character={c} />
                {editing && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <InlineText label="Nom" value={c.name} onCommit={(name) => name && void patchCharacter(c.id, { name })} />
                    <InlineText label="Concept" value={c.concept} placeholder="Peuple, métier…" onCommit={(concept) => void patchCharacter(c.id, { concept })} />
                    <InlineText label="Relation" value={c.relation} placeholder="Relation avec vous (loyal, méfiant…)" onCommit={(relation) => void patchCharacter(c.id, { relation })} className="sm:col-span-2" />
                    <label className="flex items-center gap-2 text-base text-parchment-300">
                      PV max
                      <span className="w-20">
                        <NumberField label="Points de vie maximum" value={c.hpMax} onCommit={(v) => void patchCharacter(c.id, { hpMax: Math.max(0, Math.round(v)) })} />
                      </span>
                    </label>
                  </div>
                )}
                <Stats character={c} editing={editing} />
                <div>
                  <Label>Événements connus, notes</Label>
                  <AutoNotes character={c} rows={3} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm text-parchment-400">
                    {itemCount} objet{itemCount > 1 ? 's' : ''}
                  </span>
                  {editing && (
                    <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} className="hover:text-blood-500" onClick={onDelete}>
                      Supprimer
                    </Button>
                  )}
                  <Button size="sm" variant={editing ? 'primary' : 'secondary'} icon={editing ? <Check className="size-4" /> : <Pencil className="size-4" />} onClick={() => setEditing((e) => !e)}>
                    {editing ? 'Terminé' : 'Modifier'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>
    </motion.li>
  );
}

function NewCharacterForm({ kind, campaignId, onCreated }: { kind: 'pj' | 'compagnon'; campaignId: string; onCreated?: () => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void createCharacter(campaignId, kind, name).then((c) => {
          setName('');
          toast({ tone: 'success', title: kind === 'pj' ? `Bienvenue, ${c.name}` : `${c.name} rejoint le groupe` });
          onCreated?.();
        });
      }}
    >
      <input
        value={name}
        maxLength={200}
        placeholder={kind === 'pj' ? 'Nom de votre personnage' : 'Nom du compagnon'}
        onChange={(e) => setName(e.target.value)}
        className={cn(inputClass(kind === 'pj'), 'h-12')}
        aria-label={kind === 'pj' ? 'Nom du personnage' : 'Nom du compagnon'}
      />
      <Button type="submit" variant="primary" icon={kind === 'pj' ? <Plus className="size-5" /> : <UserPlus className="size-5" />} disabled={!name.trim()}>
        {kind === 'pj' ? 'Créer' : 'Ajouter'}
      </Button>
    </form>
  );
}

export function CharactersPage() {
  const campaign = useActiveCampaign();
  const characters = useCharacters(campaign?.id);
  const items = useItems(campaign?.id) ?? [];
  const { ask, dialog } = useDelete();
  if (!campaign || !characters) return null;
  const pj = findPj(characters);
  const companions = characters.filter((c) => c.id !== pj?.id);
  const count = (id: string) => items.filter((i) => i.ownerId === id).length;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <motion.div
        className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:p-6"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      >
        <motion.div variants={RISE} transition={{ duration: 0.5, ease: EASE_OUT }}>
          {pj ? (
            <PlayerSheet pj={pj} itemCount={count(pj.id)} onDelete={() => ask(pj)} />
          ) : (
            <Panel ornate className="px-7 py-7">
              <h1 className="font-display text-2xl font-semibold text-ink-900">Votre personnage</h1>
              <p className="mt-2 text-lg text-ink-700">
                Créez sa fiche : points de vie, états, caractéristiques libres (quel que soit le système de règles), bourse
                et notes. Tout se modifie pendant la partie.
              </p>
              <div className="mt-4">
                <NewCharacterForm kind="pj" campaignId={campaign.id} />
              </div>
            </Panel>
          )}
        </motion.div>

        <motion.section variants={RISE} transition={{ duration: 0.5, ease: EASE_OUT }} className="space-y-3">
          <Panel tone="leather" className="px-4 py-3">
            <SectionTitle className="text-bronze-400">Compagnons ({companions.length})</SectionTitle>
            <div className="mt-2">
              <NewCharacterForm kind="compagnon" campaignId={campaign.id} />
            </div>
          </Panel>
          <motion.ul className="space-y-2" initial="hidden" animate="show">
            {companions.map((c, i) => (
              <CompanionCard key={c.id} c={c} index={i} itemCount={count(c.id)} onDelete={() => ask(c)} />
            ))}
          </motion.ul>
          {!companions.length && <p className="px-2 text-base italic text-parchment-400">Aucun compagnon pour l’instant.</p>}
        </motion.section>
      </motion.div>
      {dialog}
    </div>
  );
}
