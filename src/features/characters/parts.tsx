import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Plus, Trash2, UserRound, X } from 'lucide-react';
import { newId } from '@/domain/ids';
import type { Character, Stat } from '@/domain/schemas';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { addMedia, deleteMediaIfUnused } from '@/services/db/media';
import { patchCharacter } from '@/services/db/play';
import { prepareImage } from '@/services/media/image';
import { toast } from '@/stores/toasts';
import { cn } from '@/ui/cn';

/** Champs adaptés au fond (parchemin clair ou cuir sombre). */
export const inputClass = (light?: boolean) =>
  cn(
    'w-full rounded-md border px-3 text-lg outline-none transition-colors',
    light
      ? 'border-ink-700/30 bg-parchment-50/70 text-ink-900 placeholder:text-ink-500/60 focus:border-bronze-600'
      : 'border-bronze-500/35 bg-leather-950/60 text-parchment-50 placeholder:text-parchment-400/60 focus:border-gold-300/70',
  );

export function Label({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={cn('mb-1 block font-display text-xs font-semibold uppercase tracking-[0.16em]', light ? 'text-bronze-700' : 'text-bronze-400')}>
      {children}
    </span>
  );
}

/** Portrait rond ; en édition, un toucher permet d'importer une image. */
export function Portrait({ character, size, editable }: { character: Character; size: 'lg' | 'sm'; editable?: boolean }) {
  const url = useMediaUrl(character.portraitId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const dim = size === 'lg' ? 'size-24' : 'size-14';

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const img = await prepareImage(file, { maxEdge: 768, targetBytes: 300 * 1024 });
      const meta = await addMedia(character.campaignId, img.blob, 'image', { width: img.width, height: img.height, name: `Portrait — ${character.name}` });
      const old = character.portraitId;
      await patchCharacter(character.id, { portraitId: meta.id });
      if (old) await deleteMediaIfUnused(old);
    } catch (e) {
      toast({ tone: 'error', title: 'Portrait refusé', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('relative shrink-0', dim)}>
      <div className={cn('size-full overflow-hidden rounded-full border-2 border-bronze-500/70 bg-leather-900 shadow-md', character.status === 'mort' && 'grayscale')}>
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-parchment-400/70">
            <UserRound className={size === 'lg' ? 'size-12' : 'size-7'} strokeWidth={1.2} />
          </div>
        )}
      </div>
      {editable && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            aria-label="Changer le portrait"
            className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full border border-gold-200/60 bg-gradient-to-b from-gold-300 to-bronze-500 text-leather-950 shadow"
          >
            <Camera className="size-4" />
          </button>
          <input
            ref={input}
            type="file"
            accept="image/webp,image/jpeg,image/png,image/avif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void pick(f);
            }}
          />
        </>
      )}
    </div>
  );
}

/** États temporaires (empoisonné, épuisé…) : ajout en une saisie, retrait d'un toucher. */
export function Conditions({ character, light }: { character: Character; light?: boolean }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t || character.conditions.some((c) => c.toLowerCase() === t.toLowerCase())) return setText('');
    void patchCharacter(character.id, { conditions: [...character.conditions, t.slice(0, 60)] });
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AnimatePresence initial={false}>
        {character.conditions.map((c) => (
          <motion.button
            key={c}
            type="button"
            layout
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            onClick={() => void patchCharacter(character.id, { conditions: character.conditions.filter((x) => x !== c) })}
            className="flex h-9 items-center gap-1 rounded-full border border-ember-500/60 bg-ember-500/15 pl-3 pr-2 text-base text-ember-500"
            title="Retirer cet état"
          >
            {c} <X className="size-4" />
          </motion.button>
        ))}
      </AnimatePresence>
      <form
        className="min-w-36 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="+ état (empoisonné, épuisé…)"
          maxLength={60}
          className={cn(inputClass(light), 'h-9 text-base')}
          aria-label="Ajouter un état"
        />
      </form>
    </div>
  );
}

/** Bourse : pièces d'or, d'argent et de cuivre. */
export function Coins({ character, light }: { character: Character; light?: boolean }) {
  const set = (k: 'po' | 'pa' | 'pc', v: number) => void patchCharacter(character.id, { coins: { ...character.coins, [k]: Math.max(0, Math.round(v) || 0) } });
  const coins: { k: 'po' | 'pa' | 'pc'; label: string; color: string }[] = [
    { k: 'po', label: 'Or', color: 'bg-gold-300' },
    { k: 'pa', label: 'Argent', color: 'bg-parchment-300' },
    { k: 'pc', label: 'Cuivre', color: 'bg-ember-500' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {coins.map(({ k, label, color }) => (
        <label key={k} className="flex items-center gap-2">
          <span className={cn('size-4 shrink-0 rounded-full shadow-inner', color)} />
          <span className="sr-only">{label}</span>
          <NumberField value={character.coins[k]} onCommit={(v) => set(k, v)} light={light} label={`Pièces ${label.toLowerCase()}`} />
        </label>
      ))}
    </div>
  );
}

/** Champ numérique qui n'enregistre qu'en fin de saisie (pas à chaque chiffre). */
export function NumberField({ value, onCommit, light, label }: { value: number; onCommit: (v: number) => void; light?: boolean; label: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setV(String(value));
  };
  return (
    <input
      value={v}
      inputMode="numeric"
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={cn(inputClass(light), 'h-11 min-w-0 text-center tabular-nums')}
    />
  );
}

/** Notes libres, enregistrées automatiquement. */
export function AutoNotes({ character, light, rows = 5 }: { character: Character; light?: boolean; rows?: number }) {
  const [text, setText] = useState(character.notes);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(text);
  useEffect(() => {
    if (document.activeElement?.getAttribute('data-notes') !== character.id) setText(character.notes);
  }, [character.notes, character.id]);
  useEffect(
    () => () => {
      // Enregistre ce qui reste en attente en quittant l'écran.
      if (timer.current) {
        window.clearTimeout(timer.current);
        void patchCharacter(character.id, { notes: latest.current });
      }
    },
    [character.id],
  );
  return (
    <textarea
      data-notes={character.id}
      value={text}
      rows={rows}
      maxLength={20000}
      placeholder="Ce que vous savez, ce qui vous lie, ce qui s’est passé…"
      onChange={(e) => {
        setText(e.target.value);
        latest.current = e.target.value;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          void patchCharacter(character.id, { notes: latest.current });
        }, 600);
      }}
      className={cn(inputClass(light), 'resize-y py-2 leading-relaxed')}
    />
  );
}

/** Caractéristiques libres (Force 14, Agilité +2, Niveau 3…), modifiables en mode édition. */
export function Stats({ character, editing, light }: { character: Character; editing: boolean; light?: boolean }) {
  const save = (stats: Stat[]) => void patchCharacter(character.id, { stats });
  if (!editing) {
    if (!character.stats.length) return <p className={cn('text-base italic', light ? 'text-ink-500' : 'text-parchment-400')}>Aucune caractéristique (bouton Modifier).</p>;
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {character.stats.map((s) => (
          <div key={s.id} className={cn('rounded-lg border px-2 py-1.5 text-center', light ? 'border-ink-700/20 bg-parchment-50/40' : 'border-bronze-500/25 bg-leather-950/40')}>
            <div className={cn('truncate font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em]', light ? 'text-bronze-700' : 'text-bronze-400')}>{s.label || '—'}</div>
            <div className={cn('truncate font-display text-xl font-semibold tabular-nums', light ? 'text-ink-900' : 'text-parchment-50')}>{s.value || '—'}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {character.stats.map((s, i) => (
        <div key={s.id} className="flex gap-2">
          <input
            defaultValue={s.label}
            placeholder="Libellé"
            maxLength={60}
            onBlur={(e) => e.target.value !== s.label && save(character.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            className={cn(inputClass(light), 'h-11 flex-[2]')}
          />
          <input
            defaultValue={s.value}
            placeholder="Valeur"
            maxLength={60}
            onBlur={(e) => e.target.value !== s.value && save(character.stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            className={cn(inputClass(light), 'h-11 flex-1 text-center')}
          />
          <button
            type="button"
            aria-label="Retirer"
            onClick={() => save(character.stats.filter((_, j) => j !== i))}
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-md', light ? 'text-ink-500 hover:text-blood-600' : 'text-parchment-400 hover:text-blood-500')}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => save([...character.stats, { id: newId('stat'), label: '', value: '' }])}
        className={cn('flex h-11 items-center gap-2 rounded-md px-3 text-base', light ? 'text-bronze-700 hover:bg-ink-900/5' : 'text-gold-300 hover:bg-parchment-100/5')}
      >
        <Plus className="size-5" /> Ajouter une caractéristique
      </button>
    </div>
  );
}
