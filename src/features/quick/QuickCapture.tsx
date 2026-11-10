import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Backpack, Check, Heart, ScrollText } from 'lucide-react';
import { parseItemInput } from '@/domain/quickEntry';
import { JOURNAL_KINDS, JOURNAL_KIND_LABELS, ITEM_CATEGORY_LABELS, type JournalKind } from '@/domain/schemas';
import { guessCategory } from '@/domain/quickEntry';
import { useActiveCampaign, useCurrentPlace } from '@/hooks/data';
import { addItemFromText, addJournalEntry, undoAddItem } from '@/services/db/play';
import { db } from '@/services/db/database';
import { useSession, type QuickTab } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Button } from '@/ui/Button';
import { Select, TextArea, TextInput } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { cn } from '@/ui/cn';
import { HpControl } from '@/features/characters/HpControl';
import { findPj, ownerLabel, useCharacters } from '@/features/play/hooks';

/**
 * Ajout rapide, accessible de partout (barre du bas, ou touche N au clavier) :
 * le MJ dit « ajoute une vieille clé à ton inventaire » → c'est fait en quelques secondes.
 * Disponible en mode Jeu : ce sont des actions de partie, pas des modifications du monde.
 */
export function QuickCapture() {
  const { quickOpen, quickTab, setQuickOpen } = useSession();
  const campaign = useActiveCampaign();
  const { location } = useCurrentPlace();
  const characters = useCharacters(campaign?.id);
  const pj = findPj(characters);
  const [tab, setTab] = useState<QuickTab>('objet');
  const [text, setText] = useState('');
  const [owner, setOwner] = useState<string>('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<JournalKind>('note');
  const [recent, setRecent] = useState<string[]>([]);
  const itemInput = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!quickOpen) return;
    setTab(quickTab);
    setRecent([]);
  }, [quickOpen, quickTab]);
  // Porteur par défaut : le personnage joueur.
  useEffect(() => {
    if (!owner && pj) setOwner(pj.id);
  }, [pj, owner]);
  // Le champ prend le focus dès l'ouverture : on tape directement.
  useEffect(() => {
    if (!quickOpen) return;
    const t = window.setTimeout(() => (tab === 'objet' ? itemInput.current : tab === 'note' ? noteInput.current : null)?.focus(), 350);
    return () => window.clearTimeout(t);
  }, [quickOpen, tab]);

  if (!campaign) return null;
  const ownerId = owner === 'commun' ? null : owner || pj?.id || null;
  const preview = text.trim() ? parseItemInput(text) : null;

  const addObject = async () => {
    if (!text.trim()) return;
    try {
      const r = await addItemFromText(campaign.id, text, ownerId, location?.id ?? null);
      const who = ownerLabel(ownerId, characters);
      setRecent((x) => [`${r.item.name} ×${r.merged ? r.item.quantity - r.previousQuantity : r.item.quantity} → ${who}`, ...x].slice(0, 6));
      setText('');
      toast({
        tone: 'success',
        title: r.merged ? `${r.item.name} : ${r.previousQuantity} → ${r.item.quantity}` : `Ajouté : ${r.item.name}${r.item.quantity > 1 ? ` ×${r.item.quantity}` : ''}`,
        message: `${who} · ${ITEM_CATEGORY_LABELS[r.item.category]}`,
        action: { label: 'Annuler', run: () => void undoAddItem(r) },
      });
      itemInput.current?.focus();
    } catch (e) {
      toast({ tone: 'error', title: 'Ajout impossible', message: (e as Error).message });
    }
  };

  const addNote = async () => {
    const clean = note.trim();
    if (!clean) return;
    const [first, ...rest] = clean.split('\n');
    const title = rest.length ? first.slice(0, 300) : clean.length <= 80 ? clean : '';
    const body = rest.length ? rest.join('\n').trim() : clean.length <= 80 ? '' : clean;
    const e = await addJournalEntry(campaign.id, { kind, title, body, locationId: location?.id ?? null });
    setNote('');
    setRecent((x) => [`${JOURNAL_KIND_LABELS[kind]} : ${title || body.slice(0, 50)}`, ...x].slice(0, 6));
    toast({
      tone: 'success',
      title: `Ajouté au journal : ${JOURNAL_KIND_LABELS[kind].toLowerCase()}`,
      action: { label: 'Annuler', run: () => void db.journal.delete(e.id) },
    });
    noteInput.current?.focus();
  };

  const present = (characters ?? []).filter((c) => c.kind === 'pj' || (c.status !== 'mort' && c.status !== 'parti'));

  return (
    <Sheet
      open={quickOpen}
      onClose={() => setQuickOpen(false)}
      title="Ajout rapide"
      subtitle={location ? `Vous êtes à : ${location.name}` : 'Objets, notes et points de vie, en quelques secondes'}
      sizeClass="w-[min(560px,96vw)]"
    >
      <div className="space-y-4 px-5 py-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'objet', label: 'Objet' },
            { value: 'note', label: 'Note' },
            { value: 'pv', label: 'Points de vie' },
          ]}
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {tab === 'objet' && (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addObject();
                  }}
                >
                  <TextInput
                    ref={itemInput}
                    value={text}
                    maxLength={200}
                    enterKeyHint="done"
                    placeholder="une vieille clé, 3 torches, potion de soin x2…"
                    onChange={(e) => setText(e.target.value)}
                    aria-label="Objet à ajouter"
                  />
                  <Button type="submit" variant="primary" icon={<Backpack className="size-5" />} disabled={!text.trim()}>
                    Ajouter
                  </Button>
                </form>
                <div className="flex flex-wrap items-center gap-2 text-base text-parchment-300">
                  <span>Dans l’inventaire de</span>
                  <Select value={owner || 'commun'} onChange={(e) => setOwner(e.target.value)} className="h-11 w-auto text-base" aria-label="Porteur">
                    {(characters ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="commun">Sac commun</option>
                  </Select>
                </div>
                {preview && (
                  <p className="text-sm text-parchment-400">
                    Sera ajouté : <strong className="text-parchment-200">{preview.name}</strong> ×{preview.quantity} ·{' '}
                    {ITEM_CATEGORY_LABELS[guessCategory(preview.name)]} — modifiable ensuite dans l’Inventaire.
                  </p>
                )}
              </>
            )}

            {tab === 'note' && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {JOURNAL_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        'h-10 rounded-full border px-3.5 text-base transition-colors',
                        kind === k ? 'border-gold-300/70 bg-gold-300/15 text-gold-200' : 'border-bronze-500/30 text-parchment-300 hover:text-parchment-100',
                      )}
                    >
                      {JOURNAL_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
                <TextArea
                  ref={noteInput}
                  rows={4}
                  value={note}
                  maxLength={50000}
                  placeholder="Ce que vous voulez retenir. La première ligne sert de titre."
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void addNote();
                    }
                  }}
                />
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-parchment-400">{location ? `Rattachée au lieu : ${location.name}` : ''}</span>
                  <Button variant="primary" icon={<ScrollText className="size-5" />} disabled={!note.trim()} onClick={() => void addNote()}>
                    Ajouter au journal
                  </Button>
                </div>
              </>
            )}

            {tab === 'pv' && (
              <div className="space-y-2">
                {present.map((c) => (
                  <div key={c.id} className="rounded-lg border border-bronze-500/25 bg-leather-950/40 px-3 py-2.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Heart className="size-4 text-blood-500" />
                      <span className="font-display text-base tracking-wide text-parchment-50">{c.name}</span>
                    </div>
                    <HpControl character={c} compact />
                  </div>
                ))}
                {!present.length && (
                  <p className="text-base italic text-parchment-400">Aucune fiche. Créez votre personnage depuis l’écran Fiches.</p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {recent.length > 0 && tab !== 'pv' && (
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1 border-t border-bronze-500/20 pt-3">
              {recent.map((r, i) => (
                <motion.li
                  key={`${r}-${recent.length - i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-base text-parchment-300"
                >
                  <Check className="size-4 text-forest-500" /> {r}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
