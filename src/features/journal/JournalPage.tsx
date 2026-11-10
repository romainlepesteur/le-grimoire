import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, MapPin, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import {
  JOURNAL_KINDS,
  JOURNAL_KIND_LABELS,
  QUEST_STATUSES,
  QUEST_STATUS_LABELS,
  type JournalEntry,
  type JournalKind,
} from '@/domain/schemas';
import { useActiveCampaign, useCampaignLocations, useCurrentPlace } from '@/hooks/data';
import { addJournalEntry, deleteJournalEntry, restoreRow, saveJournalEntry } from '@/services/db/play';
import { downloadText, journalToJson, journalToMarkdown, slug } from '@/services/export/journalExport';
import { sortLocations } from '@/services/db/locations';
import { toast } from '@/stores/toasts';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/Field';
import { Panel } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { useJournal } from '@/features/play/hooks';

const KIND_TONE: Record<JournalKind, 'bronze' | 'forest' | 'blood' | 'ink' | 'muted'> = {
  note: 'muted',
  evenement: 'bronze',
  rencontre: 'forest',
  quete: 'bronze',
  decision: 'blood',
  rumeur: 'muted',
};

function KindChips({ value, onChange, withAll }: { value: JournalKind | 'tous'; onChange: (k: JournalKind | 'tous') => void; withAll?: boolean }) {
  const list: (JournalKind | 'tous')[] = withAll ? ['tous', ...JOURNAL_KINDS] : [...JOURNAL_KINDS];
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            'h-10 rounded-full border px-3.5 text-base transition-colors',
            value === k ? 'border-gold-300/70 bg-gold-300/15 text-gold-200' : 'border-bronze-500/30 text-parchment-300 hover:text-parchment-100',
          )}
        >
          {k === 'tous' ? 'Tout' : JOURNAL_KIND_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

function EntryEditor({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const [draft, setDraft] = useState<JournalEntry | null>(entry);
  const [last, setLast] = useState(entry);
  if (entry !== last) {
    setLast(entry);
    setDraft(entry);
  }
  const locations = useCampaignLocations(entry?.campaignId);
  const set = <K extends keyof JournalEntry>(k: K, v: JournalEntry[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry?.title || (entry ? JOURNAL_KIND_LABELS[entry.kind] : '')}
      subtitle={entry ? `Noté le ${new Date(entry.createdAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}` : undefined}
      sizeClass="w-[min(640px,96vw)]"
      footer={
        <div className="flex gap-3">
          <Button
            variant="ghost"
            icon={<Trash2 className="size-5" />}
            className="hover:text-blood-500"
            onClick={() => {
              if (!entry) return;
              onClose();
              void deleteJournalEntry(entry.id).then((removed) => {
                if (removed) toast({ tone: 'success', title: 'Entrée supprimée', action: { label: 'Annuler', run: () => void restoreRow('journal', removed) } });
              });
            }}
          >
            Supprimer
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => draft && void saveJournalEntry(draft).then(onClose)}>
            Enregistrer
          </Button>
        </div>
      }
    >
      {draft && (
        <div className="space-y-4 px-5 py-4">
          <KindChips value={draft.kind} onChange={(k) => k !== 'tous' && set('kind', k)} />
          <Field label="Titre">
            <TextInput value={draft.title} maxLength={300} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Texte">
            <TextArea rows={8} value={draft.body} maxLength={50000} onChange={(e) => set('body', e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date dans le monde">
              <TextInput value={draft.gameDate} maxLength={120} placeholder="3e jour de la lune des moissons" onChange={(e) => set('gameDate', e.target.value)} />
            </Field>
            <Field label="Lieu">
              <Select value={draft.locationId ?? ''} onChange={(e) => set('locationId', e.target.value || null)}>
                <option value="">— Aucun —</option>
                {sortLocations(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {draft.kind === 'quete' && (
            <Field label="État de la quête">
              <Select value={draft.questStatus} onChange={(e) => set('questStatus', e.target.value as JournalEntry['questStatus'])}>
                {QUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {QUEST_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function JournalPage() {
  const campaign = useActiveCampaign();
  const { location } = useCurrentPlace();
  const entries = useJournal(campaign?.id);
  const locations = useCampaignLocations(campaign?.id);
  const locById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations]);
  const [filter, setFilter] = useState<JournalKind | 'tous'>('tous');
  const [search, setSearch] = useState('');
  const [newKind, setNewKind] = useState<JournalKind>('note');
  const [text, setText] = useState('');
  const [gameDate, setGameDate] = useState('');
  const [open, setOpen] = useState<JournalEntry | null>(null);

  if (!campaign || !entries) return null;
  const q = search.trim().toLowerCase();
  const visible = entries
    .filter((e) => filter === 'tous' || e.kind === filter)
    .filter((e) => !q || `${e.title}\n${e.body}\n${e.gameDate}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  const activeQuests = entries.filter((e) => e.kind === 'quete' && e.questStatus === 'en_cours').length;

  const add = async () => {
    const clean = text.trim();
    if (!clean) return;
    const [first, ...rest] = clean.split('\n');
    const title = rest.length ? first : clean.length <= 80 ? clean : '';
    const body = rest.length ? rest.join('\n').trim() : clean.length <= 80 ? '' : clean;
    const e = await addJournalEntry(campaign.id, { kind: newKind, title, body, gameDate: gameDate.trim(), locationId: location?.id ?? null });
    setText('');
    toast({ tone: 'success', title: `Ajouté au journal : ${JOURNAL_KIND_LABELS[newKind].toLowerCase()}`, action: { label: 'Annuler', run: () => void deleteJournalEntry(e.id) } });
  };

  const exportAs = (fmt: 'md' | 'json') => {
    const name = `journal-${slug(campaign.name)}`;
    if (fmt === 'md') downloadText(`${name}.md`, journalToMarkdown(campaign.name, entries, locById), 'text/markdown');
    else downloadText(`${name}.json`, journalToJson(entries), 'application/json');
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
          <Panel tone="leather" className="space-y-3 px-5 py-4">
            <KindChips value={newKind} onChange={(k) => k !== 'tous' && setNewKind(k)} />
            <TextArea
              rows={3}
              value={text}
              maxLength={50000}
              placeholder="Ce qui vient de se passer, ce qu’on vous a dit… (la première ligne sert de titre ; Ctrl+Entrée pour ajouter)"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void add();
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={gameDate}
                maxLength={120}
                placeholder="Date dans le monde (facultatif, conservée)"
                onChange={(e) => setGameDate(e.target.value)}
                className="h-11 max-w-sm text-base"
                aria-label="Date dans le monde"
              />
              <span className="flex-1 truncate text-sm text-parchment-400">{location ? `Lieu : ${location.name}` : ''}</span>
              <Button variant="primary" disabled={!text.trim()} onClick={() => void add()}>
                Ajouter au journal
              </Button>
            </div>
          </Panel>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2">
          <KindChips value={filter} onChange={setFilter} withAll />
          <div className="flex-1" />
          <label className="relative w-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-parchment-400" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher" className="h-11 pl-9 text-base" aria-label="Chercher dans le journal" />
          </label>
          <IconButton label="Exporter en Markdown (lisible)" onClick={() => exportAs('md')} disabled={!entries.length}>
            <Download className="size-5" />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={() => exportAs('json')} disabled={!entries.length}>
            JSON
          </Button>
        </div>
        {activeQuests > 0 && filter === 'tous' && (
          <p className="px-1 text-base text-parchment-300">
            {activeQuests} quête{activeQuests > 1 ? 's' : ''} en cours ·{' '}
            <button type="button" className="text-gold-300 underline underline-offset-2" onClick={() => setFilter('quete')}>
              voir les quêtes
            </button>
          </p>
        )}

        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map((e, i) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.025, ease: EASE_OUT }}
              >
                <Panel className={cn('flex gap-3 px-4 py-3', e.kind === 'quete' && e.questStatus !== 'en_cours' && 'opacity-70')}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(e)}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={KIND_TONE[e.kind] === 'muted' ? 'ink' : KIND_TONE[e.kind]}>{JOURNAL_KIND_LABELS[e.kind]}</Badge>
                      {e.kind === 'quete' && <Badge tone="ink">{QUEST_STATUS_LABELS[e.questStatus]}</Badge>}
                      {e.gameDate && <span className="text-sm italic text-ink-500">{e.gameDate}</span>}
                    </div>
                    {e.title && <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-ink-900">{e.title}</h3>}
                    {e.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-base leading-relaxed text-ink-700">{e.body}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-500">
                      <span>{new Date(e.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      {e.locationId && locById.get(e.locationId) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5" /> {locById.get(e.locationId)!.name}
                        </span>
                      )}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col items-center">
                    <IconButton tone="light" label={e.pinned ? 'Détacher' : 'Épingler en haut'} active={e.pinned} onClick={() => void saveJournalEntry({ ...e, pinned: !e.pinned })}>
                      {e.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
                    </IconButton>
                    {e.kind === 'quete' && e.questStatus === 'en_cours' && (
                      <Button variant="ink" size="sm" className="mt-1" onClick={() => void saveJournalEntry({ ...e, questStatus: 'terminee' })}>
                        Terminée
                      </Button>
                    )}
                  </div>
                </Panel>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {!visible.length && (
          <p className="px-1 py-8 text-center text-lg italic text-parchment-400">
            {entries.length ? 'Aucune entrée ne correspond.' : 'Le journal est vide. Notez ici ce qui compte : rencontres, quêtes, décisions, rumeurs.'}
          </p>
        )}
      </div>
      <EntryEditor entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}
