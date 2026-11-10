import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { ITEM_CATEGORIES, ITEM_CATEGORY_LABELS, type Item } from '@/domain/schemas';
import { useActiveCampaign, useCampaignLocations, useCurrentPlace } from '@/hooks/data';
import { addItemFromText, changeQuantity, deleteItem, patchItem, restoreRow, saveItem, undoAddItem } from '@/services/db/play';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/Field';
import { Panel } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { findPj, ownerLabel, useCharacters, useItems } from '@/features/play/hooks';

type OwnerFilter = 'tous' | 'commun' | string;
const EQUIPPABLE = new Set(['arme', 'armure', 'magique', 'outil']);

function ItemEditor({ item, onClose, owners }: { item: Item | null; onClose: () => void; owners: { id: string | null; label: string }[] }) {
  const [draft, setDraft] = useState<Item | null>(item);
  const locations = useCampaignLocations(item?.campaignId);
  const [last, setLast] = useState<Item | null>(item);
  if (item && item !== last) {
    setLast(item);
    setDraft(item);
  }
  const foundAt = draft?.foundAtId ? locations?.find((l) => l.id === draft.foundAtId)?.name : null;
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={item?.name ?? ''}
      subtitle={foundAt ? `Obtenu à : ${foundAt}` : 'Objet de l’inventaire'}
      footer={
        <div className="flex gap-3">
          <Button
            variant="ghost"
            icon={<Trash2 className="size-5" />}
            className="hover:text-blood-500"
            onClick={() => {
              if (!item) return;
              onClose();
              void deleteItem(item.id).then((removed) => {
                if (removed) toast({ tone: 'success', title: `${removed.name} retiré`, action: { label: 'Annuler', run: () => void restoreRow('items', removed) } });
              });
            }}
          >
            Retirer
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
              void saveItem(draft)
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
            <TextInput value={draft.name} maxLength={200} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité">
              <TextInput type="number" min={0} value={draft.quantity} onChange={(e) => set('quantity', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Poids (facultatif)">
              <TextInput
                inputMode="decimal"
                value={draft.weight ?? ''}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value.replace(',', '.');
                  set('weight', v === '' ? null : Math.max(0, Number(v) || 0));
                }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie">
              <Select value={draft.category} onChange={(e) => set('category', e.target.value as Item['category'])}>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ITEM_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Porté par">
              <Select value={draft.ownerId ?? ''} onChange={(e) => set('ownerId', e.target.value || null)}>
                {owners.map((o) => (
                  <option key={o.id ?? 'commun'} value={o.id ?? ''}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex min-h-12 items-center gap-3 text-lg text-parchment-100">
            <input type="checkbox" className="size-6 accent-[var(--color-gold-300)]" checked={draft.equipped} onChange={(e) => set('equipped', e.target.checked)} />
            Équipé
          </label>
          <Field label="Description, propriétés">
            <TextArea rows={5} value={draft.description} maxLength={5000} placeholder="Ce que l’on sait de l’objet (le MJ vous l’a décrit…)" onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

function ItemRow({ item, showOwner, ownerName, onOpen, index }: { item: Item; showOwner: boolean; ownerName: string; onOpen: () => void; index: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.02, ease: EASE_OUT }}
      className="flex items-center gap-2 rounded-lg border border-bronze-500/20 bg-leather-950/30 py-1 pl-3 pr-1"
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1.5 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-lg text-parchment-50">{item.name}</span>
          {item.equipped && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-gold-300/50 px-2 text-xs text-gold-200">
              <Shield className="size-3" /> équipé
            </span>
          )}
        </span>
        {(showOwner || item.description) && (
          <span className="block truncate text-sm text-parchment-400">{[showOwner && ownerName, item.description].filter(Boolean).join(' · ')}</span>
        )}
      </button>
      {EQUIPPABLE.has(item.category) && (
        <IconButton label={item.equipped ? 'Déséquiper' : 'Équiper'} active={item.equipped} onClick={() => void patchItem(item.id, { equipped: !item.equipped })}>
          <Shield className="size-5" />
        </IconButton>
      )}
      <IconButton
        label="Un de moins"
        onClick={() =>
          void changeQuantity(item.id, -1).then((r) => {
            if (r?.removed) toast({ tone: 'info', title: `${r.removed.name} : plus aucun`, action: { label: 'Annuler', run: () => void restoreRow('items', r.removed!) } });
          })
        }
      >
        <Minus className="size-5" />
      </IconButton>
      <motion.span key={item.quantity} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-10 text-center font-display text-lg font-semibold tabular-nums text-gold-200">
        {item.quantity}
      </motion.span>
      <IconButton label="Un de plus" onClick={() => void changeQuantity(item.id, 1)}>
        <Plus className="size-5" />
      </IconButton>
    </motion.li>
  );
}

export function InventoryPage() {
  const campaign = useActiveCampaign();
  const { location } = useCurrentPlace();
  const characters = useCharacters(campaign?.id);
  const items = useItems(campaign?.id);
  const pj = findPj(characters);
  const [filter, setFilter] = useState<OwnerFilter>('tous');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [open, setOpen] = useState<Item | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const owners = useMemo(
    () => [...(characters ?? []).map((c) => ({ id: c.id as string | null, label: c.name })), { id: null, label: 'Sac commun' }],
    [characters],
  );

  if (!campaign || !items) return null;
  const targetOwner = filter === 'tous' ? (pj?.id ?? null) : filter === 'commun' ? null : filter;
  const q = search.trim().toLowerCase();
  const visible = items
    .filter((i) => filter === 'tous' || (filter === 'commun' ? i.ownerId === null : i.ownerId === filter))
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  const grouped = ITEM_CATEGORIES.map((c) => [c, visible.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name, 'fr'))] as const).filter(([, l]) => l.length);
  const weight = visible.reduce((s, i) => s + (i.weight ?? 0) * i.quantity, 0);

  const add = async () => {
    if (!text.trim()) return;
    try {
      const r = await addItemFromText(campaign.id, text, targetOwner, location?.id ?? null);
      setText('');
      toast({
        tone: 'success',
        title: r.merged ? `${r.item.name} : ${r.previousQuantity} → ${r.item.quantity}` : `Ajouté : ${r.item.name}${r.item.quantity > 1 ? ` ×${r.item.quantity}` : ''}`,
        message: `${ownerLabel(targetOwner, characters)} · ${ITEM_CATEGORY_LABELS[r.item.category]}`,
        action: { label: 'Annuler', run: () => void undoAddItem(r) },
      });
      input.current?.focus();
    } catch (e) {
      toast({ tone: 'error', title: 'Ajout impossible', message: (e as Error).message });
    }
  };

  const chips: { value: OwnerFilter; label: string; count: number }[] = [
    { value: 'tous', label: 'Tout', count: items.length },
    ...(characters ?? []).map((c) => ({ value: c.id, label: c.name, count: items.filter((i) => i.ownerId === c.id).length })),
    { value: 'commun', label: 'Sac commun', count: items.filter((i) => i.ownerId === null).length },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
          <Panel ornate className="px-5 py-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <input
                ref={input}
                value={text}
                maxLength={200}
                enterKeyHint="done"
                onChange={(e) => setText(e.target.value)}
                placeholder="Ajouter : une vieille clé, 3 torches, potion de soin x2…"
                aria-label="Ajouter un objet"
                className="h-14 min-w-0 flex-1 rounded-md border border-ink-700/30 bg-parchment-50/70 px-4 text-xl text-ink-900 outline-none placeholder:text-ink-500/60 focus:border-bronze-600"
              />
              <Button type="submit" variant="primary" size="lg" icon={<Plus className="size-6" />} disabled={!text.trim()}>
                Ajouter
              </Button>
            </form>
            <p className="mt-1.5 text-base text-ink-500">
              Ira à : <strong className="text-ink-700">{ownerLabel(targetOwner, characters)}</strong>
              {location && <> · obtenu à {location.name}</>}. Un objet déjà présent est cumulé.
            </p>
          </Panel>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setFilter(c.value)}
              className={cn(
                'relative h-11 rounded-full border px-4 text-base transition-colors',
                filter === c.value ? 'border-gold-300/70 text-leather-950' : 'border-bronze-500/30 text-parchment-200 hover:text-parchment-50',
              )}
            >
              {filter === c.value && (
                <motion.span layoutId="inv-filter" className="absolute inset-0 rounded-full bg-gradient-to-b from-gold-300 to-bronze-500" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
              )}
              <span className="relative">
                {c.label} <span className="opacity-70">({c.count})</span>
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <label className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-parchment-400" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher" className="h-11 pl-9 text-base" aria-label="Chercher un objet" />
          </label>
        </div>

        {grouped.length ? (
          <div className="space-y-4">
            {grouped.map(([cat, list]) => (
              <section key={cat}>
                <h2 className="mb-1.5 px-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-bronze-400">
                  {ITEM_CATEGORY_LABELS[cat]} ({list.length})
                </h2>
                <ul className="space-y-1.5">
                  <AnimatePresence initial={false}>
                    {list.map((i, idx) => (
                      <ItemRow key={i.id} item={i} index={idx} showOwner={filter === 'tous'} ownerName={ownerLabel(i.ownerId, characters)} onOpen={() => setOpen(i)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
            {weight > 0 && <p className="px-1 text-right text-base text-parchment-400">Poids total : {weight.toLocaleString('fr-FR')}</p>}
          </div>
        ) : (
          <p className="px-1 py-8 text-center text-lg italic text-parchment-400">
            {q ? 'Aucun objet ne correspond.' : 'Rien ici pour l’instant. Tapez un objet ci-dessus, ou utilisez « Noter » depuis n’importe quel écran.'}
          </p>
        )}
      </div>
      <ItemEditor item={open} onClose={() => setOpen(null)} owners={owners} />
    </div>
  );
}
