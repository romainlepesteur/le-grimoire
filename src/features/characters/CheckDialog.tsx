import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import { Clover, Dices, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  formatMod,
  luckCurrent,
  partsTotal,
  rerollWithLuck,
  rollCheck,
  targetName,
  targetParts,
  type CheckResult,
} from '@/domain/checks';
import { naturalD20 } from '@/domain/dice';
import type { RollMode } from '@/domain/schemas';
import { db } from '@/services/db/database';
import { recordRoll, spendLuck } from '@/services/db/play';
import { useCheck } from '@/stores/check';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { useRules } from '@/features/play/hooks';

const DC_PRESETS = [
  { value: 10, label: 'Facile' },
  { value: 15, label: 'Moyen' },
  { value: 20, label: 'Difficile' },
  { value: 25, label: 'Très difficile' },
];

/**
 * Jet de caractéristique ou de compétence, ouvert d'un toucher sur la fiche.
 * Le résultat est enregistré dans l'historique des dés AVANT d'être affiché.
 */
export function CheckDialog() {
  const { request, close } = useCheck();
  const rules = useRules();
  const character = useLiveQuery(() => (request ? db.characters.get(request.characterId) : undefined), [request?.characterId]);
  const [mode, setMode] = useState<RollMode>('normal');
  const [circumstance, setCircumstance] = useState(0);
  const [dc, setDc] = useState<number | null>(null);
  const [dcText, setDcText] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Nouveau jet demandé : on repart de zéro (la difficulté se règle à chaque fois).
  useEffect(() => {
    if (!request) return;
    setMode('normal');
    setCircumstance(0);
    setDc(null);
    setDcText('');
    setResult(null);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, close]);

  const open = !!request && !!character;
  const parts = character && request ? targetParts(character, rules, request.target) : [];
  const name = request ? targetName(rules, request.target) : '';
  const bonus = partsTotal(parts);
  const singleDie = rules.die.count === 1;
  const luckLeft = character ? luckCurrent(character, rules) : 0;
  const dieLabel = `${rules.die.count}d${rules.die.sides}`;

  const roll = async () => {
    if (!character || busy) return;
    setBusy(true);
    try {
      const r = rollCheck(rules, `${character.name} — ${name}`, parts, { mode: singleDie ? mode : 'normal', circumstance, dc });
      await recordRoll(character.campaignId, r, name, character.id);
      setResult(r);
    } catch (e) {
      toast({ tone: 'error', title: 'Jet impossible', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const reroll = async () => {
    if (!character || !result || busy) return;
    setBusy(true);
    try {
      await spendLuck(character.id, rules);
      const r = rerollWithLuck(result, rules);
      await recordRoll(character.campaignId, r, name, character.id);
      setResult(r);
    } catch (e) {
      toast({ tone: 'error', title: 'Relance impossible', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const nat = result ? naturalD20(result) : null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Jet : ${name}`}>
          <motion.div
            className="absolute inset-0 bg-leather-950/70 backdrop-blur-[2px]"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-xl tex-leather frame-gilt shadow-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <header className="flex items-start gap-3 border-b border-bronze-500/30 px-5 pt-4 pb-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-bronze-400">{character!.name}</p>
                <h2 className="font-display text-2xl font-semibold text-gold-200 text-engraved">
                  {name} <span className="text-parchment-200">{formatMod(bonus)}</span>
                </h2>
                <p className="mt-0.5 text-sm text-parchment-400">
                  {dieLabel} {parts.filter((p, i) => i === 0 || p.value).map((p) => `${formatMod(p.value)} ${p.label}`).join(' · ')}
                </p>
              </div>
              <IconButton label="Fermer" onClick={close}>
                <X className="size-6" />
              </IconButton>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              {!result ? (
                <motion.div key="options" className="space-y-4 px-5 py-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {singleDie && (
                    <Segmented
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'avantage', label: 'Avantage' },
                        { value: 'desavantage', label: 'Désavantage' },
                      ]}
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="w-32 text-base text-parchment-300">Circonstance</span>
                    <IconButton label="Malus de circonstance" onClick={() => setCircumstance((c) => c - 1)}>
                      <Minus className="size-5" />
                    </IconButton>
                    <span className="w-12 text-center font-display text-xl tabular-nums text-parchment-50">{formatMod(circumstance)}</span>
                    <IconButton label="Bonus de circonstance" onClick={() => setCircumstance((c) => c + 1)}>
                      <Plus className="size-5" />
                    </IconButton>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-base text-parchment-300">Difficulté annoncée par le MJ (facultatif)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DC_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => {
                            setDc(dc === p.value ? null : p.value);
                            setDcText('');
                          }}
                          className={cn(
                            'flex h-12 flex-col items-center justify-center rounded-lg border px-3 leading-tight transition-colors',
                            dc === p.value && !dcText ? 'border-gold-300/70 bg-gold-300/15 text-gold-200' : 'border-bronze-500/30 text-parchment-200 hover:border-bronze-400',
                          )}
                        >
                          <span className="font-display text-base font-semibold">{p.value}</span>
                          <span className="text-[0.7rem] text-parchment-400">{p.label}</span>
                        </button>
                      ))}
                      <input
                        value={dcText}
                        inputMode="numeric"
                        placeholder="Autre"
                        aria-label="Autre difficulté"
                        onChange={(e) => {
                          setDcText(e.target.value);
                          const n = parseInt(e.target.value, 10);
                          setDc(Number.isFinite(n) ? n : null);
                        }}
                        className="h-12 w-20 rounded-lg border border-bronze-500/35 bg-leather-950/60 text-center font-display text-lg text-parchment-50 outline-none focus:border-gold-300/70"
                      />
                    </div>
                  </div>
                  <Button variant="primary" size="lg" className="w-full" icon={<Dices className="size-6" />} onClick={() => void roll()} disabled={busy}>
                    Lancer {dieLabel} {formatMod(bonus + circumstance)}
                    {dc != null ? ` contre ${dc}` : ''}
                  </Button>
                </motion.div>
              ) : (
                <motion.div key={`r-${result.total}-${result.luckReroll}`} className="px-5 py-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <motion.span
                      initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 16 }}
                      className={cn(
                        'font-display text-7xl font-semibold leading-none tabular-nums text-engraved',
                        nat === 'critique' ? 'text-gold-200' : nat === 'echec' ? 'text-blood-500' : 'text-parchment-50',
                      )}
                    >
                      {result.total}
                    </motion.span>
                    {result.outcome && (
                      <motion.span
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className={cn(
                          'rounded-full border px-4 py-1 font-display text-base font-semibold uppercase tracking-[0.2em]',
                          result.outcome === 'reussite' ? 'border-forest-500 bg-forest-700/40 text-parchment-50' : 'border-blood-500 bg-blood-600/30 text-parchment-50',
                        )}
                      >
                        {result.outcome === 'reussite' ? 'Réussite' : 'Échec'} · difficulté {result.dc}
                      </motion.span>
                    )}
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {result.groups.flatMap((g, gi) =>
                        g.values.map((v, i) => {
                          const dropped = g.kept && !g.kept.includes(i);
                          return (
                            <span
                              key={`${gi}-${i}`}
                              className={cn(
                                'inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-2 font-display text-lg font-semibold tabular-nums',
                                dropped ? 'border-parchment-400/20 text-parchment-400/50 line-through' : 'border-bronze-500/50 bg-leather-950/50 text-parchment-100',
                              )}
                            >
                              {v}
                            </span>
                          );
                        }),
                      )}
                    </div>
                    <p className="text-base text-parchment-300">
                      {result.total - result.modifier} <span className="text-parchment-400">dé</span>
                      {result.breakdown.map((p) => (
                        <span key={p.label}>
                          {' '}
                          {formatMod(p.value)} <span className="text-parchment-400">{p.label}</span>
                        </span>
                      ))}
                    </p>
                    {nat && <p className={cn('font-display text-sm font-semibold uppercase tracking-[0.2em]', nat === 'critique' ? 'text-gold-300' : 'text-blood-500')}>{nat === 'critique' ? '20 naturel' : '1 naturel'}</p>}
                    {result.luckReroll && <p className="text-sm italic text-parchment-400">Relancé avec un point de chance : le meilleur jet est gardé.</p>}
                  </div>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {rules.luck.enabled && !result.luckReroll && (
                      <Button icon={<Clover className="size-5" />} disabled={luckLeft <= 0 || busy} onClick={() => void reroll()} title="Relancer et garder le meilleur des deux jets">
                        Relancer avec la chance ({luckLeft})
                      </Button>
                    )}
                    <Button variant="ghost" icon={<RotateCcw className="size-5" />} onClick={() => setResult(null)}>
                      Nouveau jet
                    </Button>
                    <Button variant="primary" onClick={close}>
                      Fermer
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
