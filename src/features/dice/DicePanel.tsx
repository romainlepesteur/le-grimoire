import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  DiceFormulaError,
  formatFormula,
  naturalD20,
  parseFormula,
  rollDice,
  supportsAdvantage,
  type DiceSpec,
} from '@/domain/dice';
import { DICE_SIDES, type DiceRoll, type RollMode } from '@/domain/schemas';
import { useActiveCampaign } from '@/hooks/data';
import { clearDiceHistory, recordRoll } from '@/services/db/play';
import { diceHistoryToCsv, downloadText, slug } from '@/services/export/journalExport';
import { db } from '@/services/db/database';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { TextInput } from '@/ui/Field';
import { SectionTitle } from '@/ui/Panel';
import { Segmented } from '@/ui/Segmented';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { useDiceRolls } from '@/features/play/hooks';

/** Silhouettes simples des dés (sans texte), pour des boutons reconnaissables d'un coup d'œil. */
function DieShape({ sides, className }: { sides: number; className?: string }) {
  const paths: Record<number, string> = {
    4: 'M12 2 L22 20 L2 20 Z',
    6: 'M4 4 H20 V20 H4 Z',
    8: 'M12 2 L22 12 L12 22 L2 12 Z',
    10: 'M12 2 L21 10 L12 22 L3 10 Z',
    12: 'M12 2 L21 8.5 L17.5 20 H6.5 L3 8.5 Z',
    20: 'M12 2 L21 7 V17 L12 22 L3 17 V7 Z',
    100: 'M12 2 L21 10 L12 22 L3 10 Z',
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={paths[sides] ?? paths[20]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function DieValues({ roll, large }: { roll: Pick<DiceRoll, 'groups'>; large?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {roll.groups.flatMap((g, gi) =>
        g.values.map((v, i) => {
          const dropped = g.kept && !g.kept.includes(i);
          const crit = g.sides === 20 && !dropped && (v === 20 || v === 1);
          return (
            <span
              key={`${gi}-${i}`}
              title={`d${g.sides}`}
              className={cn(
                'inline-flex items-center justify-center rounded-md border font-display font-semibold tabular-nums',
                large ? 'h-10 min-w-10 px-2 text-lg' : 'h-7 min-w-7 px-1.5 text-sm',
                dropped
                  ? 'border-parchment-400/20 text-parchment-400/50 line-through'
                  : crit && v === 20
                    ? 'border-gold-300 bg-gold-300/20 text-gold-200'
                    : crit
                      ? 'border-blood-500 bg-blood-600/25 text-parchment-50'
                      : 'border-bronze-500/50 bg-leather-950/50 text-parchment-100',
              )}
            >
              {v}
            </span>
          );
        }),
      )}
    </div>
  );
}

export function DicePanel() {
  const campaign = useActiveCampaign();
  const rolls = useDiceRolls(campaign?.id, 40) ?? [];
  const [pool, setPool] = useState<Record<number, number>>({});
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>('normal');
  const [label, setLabel] = useState('');
  const [formula, setFormula] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const last = rolls[0];

  const poolSpec: DiceSpec | null = (() => {
    const groups = DICE_SIDES.filter((s) => pool[s]).map((s) => ({ count: pool[s], sides: s }));
    return groups.length ? { groups, modifier } : null;
  })();
  const canAdvantage = !!poolSpec && supportsAdvantage(poolSpec);

  const roll = async (spec: DiceSpec, rollMode: RollMode) => {
    if (!campaign || busy) return;
    setBusy(true);
    try {
      // Le tirage est enregistré AVANT d'être affiché : ce qu'on voit est ce qui est conservé.
      await recordRoll(campaign.id, rollDice(spec, rollMode), label);
    } catch (e) {
      toast({ tone: 'error', title: 'Lancer impossible', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rollFormula = () => {
    try {
      const spec = parseFormula(formula);
      void roll(spec, supportsAdvantage(spec) ? mode : 'normal');
    } catch (e) {
      toast({ tone: 'warning', title: 'Formule incomprise', message: e instanceof DiceFormulaError ? e.message : String(e) });
    }
  };

  const nat = last ? naturalD20(last) : null;

  return (
    <div className="flex h-full flex-col gap-4 px-5 py-4 [@media(max-height:680px)]:gap-2.5 [@media(max-height:680px)]:py-3">
      {/* Dernier résultat */}
      <div className="relative flex min-h-[150px] flex-col items-center justify-center overflow-hidden rounded-xl border border-bronze-500/30 bg-leather-950/50 px-4 py-4 [@media(max-height:680px)]:min-h-[104px] [@media(max-height:680px)]:py-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {last ? (
            <motion.div
              key={last.id}
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            >
              {last.label && <span className="font-display text-sm uppercase tracking-[0.18em] text-bronze-400">{last.label}</span>}
              <span
                className={cn(
                  'font-display text-6xl font-semibold leading-none tabular-nums text-engraved [@media(max-height:680px)]:text-5xl',
                  nat === 'critique' ? 'text-gold-200' : nat === 'echec' ? 'text-blood-500' : 'text-parchment-50',
                )}
              >
                {last.total}
              </span>
              <span className="text-base text-parchment-300">{last.formula}</span>
              <DieValues roll={last} large />
              {nat && (
                <span className={cn('font-display text-sm font-semibold uppercase tracking-[0.2em]', nat === 'critique' ? 'text-gold-300' : 'text-blood-500')}>
                  {nat === 'critique' ? '20 naturel' : '1 naturel'}
                </span>
              )}
            </motion.div>
          ) : (
            <p className="text-lg italic text-parchment-400">Composez votre lancer ci-dessous.</p>
          )}
        </AnimatePresence>
      </div>

      {/* Composition */}
      <div className="grid grid-cols-7 gap-1.5">
        {DICE_SIDES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPool((p) => ({ ...p, [s]: Math.min(20, (p[s] ?? 0) + 1) }))}
            className={cn(
              'relative flex h-16 flex-col items-center justify-center rounded-lg border [@media(max-height:680px)]:h-13 transition-[color,background-color,border-color,transform] duration-150 active:scale-90',
              pool[s] ? 'border-gold-300/60 bg-gold-300/12 text-gold-200' : 'border-bronze-500/35 text-parchment-200 hover:border-bronze-400',
            )}
            aria-label={`Ajouter un d${s}`}
          >
            <DieShape sides={s} className="size-7" />
            <span className="font-display text-xs font-semibold">d{s}</span>
            <AnimatePresence>
              {pool[s] ? (
                <motion.span
                  key={pool[s]}
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-gold-300 font-display text-xs font-bold text-leather-950"
                >
                  {pool[s]}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base text-parchment-300">Modificateur</span>
        <IconButton label="Modificateur moins un" onClick={() => setModifier((m) => m - 1)}>
          <Minus className="size-5" />
        </IconButton>
        <span className="w-12 text-center font-display text-xl tabular-nums text-parchment-50">{modifier > 0 ? `+${modifier}` : modifier}</span>
        <IconButton label="Modificateur plus un" onClick={() => setModifier((m) => m + 1)}>
          <Plus className="size-5" />
        </IconButton>
        <div className="flex-1" />
        <Segmented
          value={canAdvantage ? mode : 'normal'}
          onChange={(v) => canAdvantage && setMode(v)}
          className={cn(!canAdvantage && 'opacity-50')}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'avantage', label: 'Avantage' },
            { value: 'desavantage', label: 'Désav.' },
          ]}
        />
      </div>

      <div className="flex gap-2">
        <TextInput value={label} maxLength={200} placeholder="Pour quoi ? (facultatif : attaque, discrétion…)" onChange={(e) => setLabel(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={!poolSpec || busy}
          onClick={() => poolSpec && void roll(poolSpec, canAdvantage ? mode : 'normal')}
        >
          {poolSpec ? `Lancer ${formatFormula(poolSpec, canAdvantage ? mode : 'normal')}` : 'Choisissez des dés'}
        </Button>
        <IconButton
          size="lg"
          label="Vider la sélection"
          disabled={!poolSpec && !modifier}
          onClick={() => {
            setPool({});
            setModifier(0);
            setMode('normal');
          }}
        >
          <X className="size-6" />
        </IconButton>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          rollFormula();
        }}
      >
        <TextInput value={formula} placeholder="Ou tapez une formule : 2d6+3, 1d8+1d6…" onChange={(e) => setFormula(e.target.value)} aria-label="Formule de dés" />
        <Button type="submit" disabled={!formula.trim() || busy}>
          Lancer
        </Button>
      </form>

      {/* Historique */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex items-center gap-2">
          <SectionTitle className="flex-1 text-bronze-400">Historique</SectionTitle>
          {last && (
            <IconButton
              label="Relancer le dernier"
              onClick={() => {
                try {
                  void roll(parseFormula(last.formula.replace(/ avec .*$/, '')), last.mode);
                } catch {
                  /* formule ancienne illisible : on ignore */
                }
              }}
            >
              <RotateCcw className="size-5" />
            </IconButton>
          )}
          <IconButton
            label="Exporter l’historique (tableur)"
            disabled={!rolls.length}
            onClick={async () => {
              if (!campaign) return;
              const all = await db.diceRolls.where('campaignId').equals(campaign.id).toArray();
              downloadText(`des-${slug(campaign.name)}.csv`, diceHistoryToCsv(all), 'text/csv');
            }}
          >
            <Download className="size-5" />
          </IconButton>
          <IconButton label="Effacer l’historique" disabled={!rolls.length} onClick={() => setConfirmClear(true)}>
            <Trash2 className="size-5" />
          </IconButton>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
          <AnimatePresence initial={false}>
            {rolls.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 odd:bg-parchment-100/[0.03]"
              >
                <span className="w-12 shrink-0 text-sm tabular-nums text-parchment-400">
                  {new Date(r.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="min-w-0 flex-1 truncate text-base text-parchment-200">
                  {r.characterId ? r.formula : (<>{r.label && <strong className="font-semibold text-parchment-100">{r.label} · </strong>}{r.formula}</>)}
                </span>
                {r.outcome && (
                  <span
                    title={r.dc != null ? `Difficulté ${r.dc}` : undefined}
                    className={cn('shrink-0 rounded-full border px-2 text-xs font-semibold uppercase tracking-wider', r.outcome === 'reussite' ? 'border-forest-500 text-forest-500' : 'border-blood-500 text-blood-500')}
                  >
                    {r.outcome === 'reussite' ? 'réussi' : 'échec'}
                  </span>
                )}
                {r.luckReroll && <span className="shrink-0 text-xs italic text-parchment-400">chance</span>}
                <span title={r.breakdown.length ? r.breakdown.map((p) => `${p.value >= 0 ? '+' : ''}${p.value} ${p.label}`).join(' ') : undefined} className="w-10 text-right font-display text-lg font-semibold tabular-nums text-gold-200">{r.total}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {!rolls.length && <li className="px-2 py-2 text-base italic text-parchment-400">Aucun lancer pour l’instant.</li>}
        </ul>
      </section>

      <ConfirmDialog
        open={confirmClear}
        danger
        title="Effacer l’historique des dés ?"
        message="Tous les lancers enregistrés pour cette campagne seront supprimés. Vous pouvez d’abord les exporter."
        confirmLabel="Effacer"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          if (campaign) void clearDiceHistory(campaign.id);
        }}
      />
    </div>
  );
}
