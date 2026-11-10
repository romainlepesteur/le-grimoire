import { useState } from 'react';
import { motion } from 'motion/react';
import { Clover, Minus, Plus, Star } from 'lucide-react';
import { abilityMod, formatMod, luckCurrent, luckMax, partsTotal, RANK_LABELS, scoreOf, skillParts } from '@/domain/checks';
import type { Character, Rules } from '@/domain/schemas';
import { patchCharacter, recoverLuck } from '@/services/db/play';
import { useCheck } from '@/stores/check';
import { toast } from '@/stores/toasts';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { cn } from '@/ui/cn';

/**
 * Médaillons des caractéristiques : le modificateur en grand, le score en petit.
 * Un toucher lance un jet ; en mode Modifier, − / + ajustent le score.
 */
export function AbilityMedallions({ character, rules, editing, light, compact }: { character: Character; rules: Rules; editing: boolean; light?: boolean; compact?: boolean }) {
  const open = useCheck((s) => s.open);
  const setScore = (id: string, v: number) => void patchCharacter(character.id, { abilities: { ...character.abilities, [id]: Math.max(1, Math.min(30, v)) } });
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-4 sm:grid-cols-7')}>
      {rules.abilities.map((a, i) => {
        const score = scoreOf(character, a.id);
        const mod = abilityMod(score);
        return (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
            className="flex flex-col items-center gap-1"
          >
            <button
              type="button"
              onClick={() => open(character.id, { kind: 'ability', id: a.id })}
              title={`Jet de ${a.name}`}
              className={cn(
                'group relative flex aspect-square w-full max-w-[84px] flex-col items-center justify-center rounded-full border-2 transition-[transform,box-shadow] duration-200 active:scale-95',
                light
                  ? 'border-bronze-600/70 bg-[radial-gradient(circle_at_35%_30%,#fbf3df,#e9d8b0_70%)] shadow-[inset_0_0_0_3px_rgb(255_255_255/0.4),0_2px_6px_rgb(60_40_20/0.25)] hover:shadow-[inset_0_0_0_3px_rgb(255_255_255/0.4),0_0_14px_rgb(169_124_61/0.5)]'
                  : 'border-bronze-500/70 bg-[radial-gradient(circle_at_35%_30%,#3a2a1c,#1a110b_70%)] shadow-[inset_0_0_0_3px_rgb(0_0_0/0.3)] hover:shadow-[0_0_14px_rgb(227_194_122/0.35)]',
              )}
            >
              <span className={cn('font-display text-[0.62rem] font-semibold tracking-[0.12em]', light ? 'text-bronze-700' : 'text-bronze-400')}>{a.abbr}</span>
              <span className={cn('font-display font-semibold leading-none tabular-nums', compact ? 'text-xl' : 'text-2xl', light ? 'text-ink-900' : 'text-parchment-50')}>{formatMod(mod)}</span>
              <span className={cn('text-xs tabular-nums', light ? 'text-ink-500' : 'text-parchment-400')}>{score}</span>
            </button>
            {editing && (
              <div className="flex items-center">
                <button type="button" aria-label={`${a.name} moins un`} onClick={() => setScore(a.id, score - 1)} className={cn('flex size-9 items-center justify-center rounded-full', light ? 'text-ink-700 hover:bg-ink-900/5' : 'text-parchment-200 hover:bg-parchment-100/10')}>
                  <Minus className="size-4" />
                </button>
                <button type="button" aria-label={`${a.name} plus un`} onClick={() => setScore(a.id, score + 1)} className={cn('flex size-9 items-center justify-center rounded-full', light ? 'text-ink-700 hover:bg-ink-900/5' : 'text-parchment-200 hover:bg-parchment-100/10')}>
                  <Plus className="size-4" />
                </button>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Pastilles de rang : ○ non formé, ● formé, ◆ expert. */
function RankPips({ rank, light }: { rank: number; light?: boolean }) {
  const on = light ? 'bg-bronze-600 border-bronze-700' : 'bg-gold-300 border-gold-200';
  const off = light ? 'border-ink-700/40' : 'border-parchment-300/40';
  return (
    <span className="flex items-center gap-1" aria-label={RANK_LABELS[rank]}>
      <span className={cn('size-3 rounded-full border', rank >= 1 ? on : off)} />
      <span className={cn('size-3 rotate-45 border', rank >= 2 ? on : off)} />
    </span>
  );
}

/**
 * Compétences : favorites en tête, total à droite. Un toucher lance un jet.
 * L'étoile (favori) reste accessible en jeu ; rang et bonus se règlent en mode Modifier.
 * `onlyRelevant` (compagnons) : seules les compétences formées, bonifiées ou favorites.
 */
export function SkillList({ character, rules, editing, light, onlyRelevant }: { character: Character; rules: Rules; editing: boolean; light?: boolean; onlyRelevant?: boolean }) {
  const open = useCheck((s) => s.open);
  const [showAll, setShowAll] = useState(false);
  const entry = (id: string) => character.skills[id] ?? { rank: 0, bonus: 0, favorite: false };
  const patch = (id: string, p: Partial<{ rank: number; bonus: number; favorite: boolean }>) =>
    void patchCharacter(character.id, { skills: { ...character.skills, [id]: { ...entry(id), ...p } } });

  const all = [...rules.skills].sort((a, b) => Number(entry(b.id).favorite) - Number(entry(a.id).favorite) || a.name.localeCompare(b.name, 'fr'));
  const relevant = all.filter((s) => entry(s.id).rank > 0 || entry(s.id).bonus !== 0 || entry(s.id).favorite);
  const list = onlyRelevant && !showAll && !editing ? relevant : all;

  return (
    <div>
      <ul className={cn('grid gap-1', !onlyRelevant && 'sm:grid-cols-2')}>
        {list.map((s) => {
          const e = entry(s.id);
          const total = partsTotal(skillParts(character, rules, s.id));
          const abbr = rules.abilities.find((a) => a.id === s.abilityId)?.abbr ?? '?';
          return (
            <li key={s.id} className={cn('flex items-center gap-1 rounded-lg border', light ? 'border-ink-700/15 bg-parchment-50/30' : 'border-bronze-500/15 bg-leather-950/30')}>
              <button
                type="button"
                aria-label={e.favorite ? `Retirer ${s.name} des favorites` : `Mettre ${s.name} en favorite`}
                onClick={() => patch(s.id, { favorite: !e.favorite })}
                className="flex size-11 shrink-0 items-center justify-center"
              >
                <Star className={cn('size-4', e.favorite ? (light ? 'fill-bronze-600 text-bronze-600' : 'fill-gold-300 text-gold-300') : light ? 'text-ink-500/50' : 'text-parchment-400/50')} />
              </button>
              {editing ? (
                <button type="button" onClick={() => patch(s.id, { rank: (e.rank + 1) % 3 })} className="flex h-11 items-center px-1" title="Changer le rang">
                  <RankPips rank={e.rank} light={light} />
                </button>
              ) : (
                <RankPips rank={e.rank} light={light} />
              )}
              <button type="button" onClick={() => open(character.id, { kind: 'skill', id: s.id })} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 pl-2 pr-3 text-left" title={`Jet de ${s.name}`}>
                <span className={cn('min-w-0 flex-1 truncate text-lg', light ? 'text-ink-900' : 'text-parchment-50')}>{s.name}</span>
                <span className={cn('text-xs', light ? 'text-ink-500' : 'text-parchment-400')}>{abbr}</span>
                <span className={cn('w-10 text-right font-display text-lg font-semibold tabular-nums', light ? 'text-bronze-700' : 'text-gold-200')}>{formatMod(total)}</span>
              </button>
              {editing && (
                <label className="flex items-center gap-1 pr-2" title="Bonus divers (objet, entraînement…)">
                  <input
                    key={e.bonus}
                    defaultValue={e.bonus || ''}
                    placeholder="±0"
                    inputMode="numeric"
                    aria-label={`Bonus divers de ${s.name}`}
                    onBlur={(ev) => {
                      const n = parseInt(ev.target.value.replace('−', '-'), 10);
                      const v = Number.isFinite(n) ? Math.max(-50, Math.min(50, n)) : 0;
                      if (v !== e.bonus) patch(s.id, { bonus: v });
                    }}
                    className={cn('h-9 w-12 rounded-md border text-center text-base outline-none', light ? 'border-ink-700/30 bg-parchment-50/70 text-ink-900' : 'border-bronze-500/35 bg-leather-950/60 text-parchment-50')}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {onlyRelevant && !editing && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className={cn('mt-1.5 h-10 px-2 text-base underline underline-offset-2', light ? 'text-bronze-700' : 'text-gold-300')}>
          {showAll ? 'N’afficher que les compétences utiles' : `Toutes les compétences (${rules.skills.length})`}
        </button>
      )}
      {onlyRelevant && !relevant.length && !showAll && !editing && (
        <p className={cn('text-base italic', light ? 'text-ink-500' : 'text-parchment-400')}>Aucune compétence formée. Touchez « Toutes les compétences » pour un jet.</p>
      )}
      {editing && (
        <p className={cn('mt-2 text-sm', light ? 'text-ink-500' : 'text-parchment-400')}>
          Touchez les pastilles pour changer le rang : non formé, formé ({formatMod(rules.rankBonus[0])}), expert ({formatMod(rules.rankBonus[1])}). Case de droite : bonus divers.
        </p>
      )}
    </div>
  );
}

/**
 * Points de chance : limités. Ils se dépensent pour relancer un jet (depuis la fenêtre de jet)
 * et ne se récupèrent que manuellement, quand le MJ l'accorde.
 */
export function LuckBlock({ character, rules, light }: { character: Character; rules: Rules; light?: boolean }) {
  const [recovering, setRecovering] = useState(false);
  const [amount, setAmount] = useState(1);
  if (!rules.luck.enabled) return null;
  const max = luckMax(character, rules);
  const current = luckCurrent(character, rules);
  if (max <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5" aria-label={`${current} points de chance sur ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <motion.span key={i} animate={{ scale: i < current ? 1 : 0.8, opacity: i < current ? 1 : 0.45 }}>
            <Clover className={cn('size-7', i < current ? (light ? 'fill-forest-500/30 text-forest-700' : 'fill-forest-500/40 text-forest-500') : light ? 'text-ink-500/50' : 'text-parchment-400/50')} strokeWidth={1.5} />
          </motion.span>
        ))}
      </div>
      <span className={cn('font-display text-lg tabular-nums', light ? 'text-ink-900' : 'text-parchment-50')}>
        {current} / {max}
      </span>
      <div className="flex-1" />
      <Button
        variant={light ? 'ink' : 'secondary'}
        size="sm"
        disabled={current >= max}
        onClick={() => {
          setAmount(max - current);
          setRecovering(true);
        }}
      >
        Récupérer…
      </Button>
      <Dialog
        open={recovering}
        onClose={() => setRecovering(false)}
        title="Récupérer des points de chance"
        actions={
          <>
            <Button variant="ink" onClick={() => setRecovering(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setRecovering(false);
                void recoverLuck(character.id, amount, rules).then((n) => toast({ tone: 'success', title: `Chance : ${n} / ${max}` }));
              }}
            >
              Récupérer {amount}
            </Button>
          </>
        }
      >
        <p>À faire seulement quand le MJ l’accorde : rien n’est rechargé automatiquement.</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <Button variant="ink" size="sm" onClick={() => setAmount((a) => Math.max(1, a - 1))} aria-label="Un point de moins">
            <Minus className="size-5" />
          </Button>
          <span className="w-16 text-center font-display text-3xl tabular-nums text-ink-900">{amount}</span>
          <Button variant="ink" size="sm" onClick={() => setAmount((a) => Math.min(max - current, a + 1))} aria-label="Un point de plus">
            <Plus className="size-5" />
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
