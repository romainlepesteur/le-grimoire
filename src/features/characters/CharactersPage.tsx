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
import { findPj, useCharacters, useItems, useRules } from '@/features/play/hooks';
import { AbilityMedallions, LuckBlock, SkillList } from './rpg';
import { TraitsSection } from './traits';
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
type SheetTab = 'carac' | 'competences' | 'traits' | 'bourse';

/** Onglets de la fiche : moins de défilement sur tablette. */
function SheetTabs({ value, onChange, light, compact }: { value: SheetTab; onChange: (t: SheetTab) => void; light?: boolean; compact?: boolean }) {
  const tabs: { v: SheetTab; label: string }[] = [
    { v: 'carac', label: compact ? 'Carac.' : 'Caractéristiques' },
    { v: 'competences', label: 'Compétences' },
    { v: 'traits', label: 'Traits' },
    { v: 'bourse', label: compact ? 'Notes' : 'Bourse, notes' },
  ];
  return (
    <div role="tablist" className={cn('mt-4 flex gap-1 border-b', light ? 'border-ink-700/20' : 'border-bronze-500/25')}>
      {tabs.map((t) => (
        <button
          key={t.v}
          type="button"
          role="tab"
          aria-selected={value === t.v}
          onClick={() => onChange(t.v)}
          className={cn(
            'relative h-11 flex-1 truncate whitespace-nowrap px-1.5 font-display text-[0.72rem] font-semibold uppercase tracking-[0.08em] transition-colors',
            value === t.v ? (light ? 'text-ink-900' : 'text-gold-200') : light ? 'text-ink-500 hover:text-ink-700' : 'text-parchment-400 hover:text-parchment-200',
          )}
        >
          {t.label}
          {value === t.v && (
            <motion.span
              layoutId={`sheet-tab-${light ? 'l' : 'd'}`}
              className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full', light ? 'bg-bronze-600' : 'bg-gold-300')}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

function PlayerSheet({ pj, itemCount, onDelete }: { pj: Character; itemCount: number; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<SheetTab>('carac');
  const rules = useRules();
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

      <SheetTabs value={tab} onChange={setTab} light />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          className="mt-3"
        >
          {tab === 'carac' && (
            <div className="space-y-4">
              <AbilityMedallions character={pj} rules={rules} editing={editing} light />
              <p className="-mt-1 text-center text-sm text-ink-500">Touchez une caractéristique pour faire un jet.</p>
              {rules.luck.enabled && (
                <section>
                  <Label light>Chance</Label>
                  <LuckBlock character={pj} rules={rules} light />
                </section>
              )}
              {(pj.stats.length > 0 || editing) && (
                <section>
                  <Label light>Autres valeurs (niveau, défense, vitesse…)</Label>
                  <Stats character={pj} editing={editing} light />
                </section>
              )}
            </div>
          )}
          {tab === 'competences' && <SkillList character={pj} rules={rules} editing={editing} light />}
          {tab === 'traits' && <TraitsSection character={pj} rules={rules} light />}
          {tab === 'bourse' && (
            <div className="space-y-4">
              <section>
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
              <section>
                <Label light>Notes</Label>
                <AutoNotes character={pj} light rows={6} />
              </section>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

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
  const [tab, setTab] = useState<SheetTab>('carac');
  const rules = useRules();
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
                <SheetTabs value={tab} onChange={setTab} compact />
                <div>
                  {tab === 'carac' && (
                    <div className="space-y-3">
                      <AbilityMedallions character={c} rules={rules} editing={editing} compact />
                      {rules.luck.enabled && <LuckBlock character={c} rules={rules} />}
                      {(c.stats.length > 0 || editing) && <Stats character={c} editing={editing} />}
                    </div>
                  )}
                  {tab === 'competences' && <SkillList character={c} rules={rules} editing={editing} onlyRelevant />}
                  {tab === 'traits' && <TraitsSection character={c} rules={rules} />}
                  {tab === 'bourse' && (
                    <div className="space-y-3">
                      <Coins character={c} />
                      <div>
                        <Label>Événements connus, notes</Label>
                        <AutoNotes character={c} rows={3} />
                      </div>
                    </div>
                  )}
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
