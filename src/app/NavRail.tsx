import { NavLink } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Backpack, Compass, Feather, Lock, Map, Music, ScrollText, Settings, Users } from 'lucide-react';
import { useSession } from '@/stores/session';
import { cn } from '@/ui/cn';

const ITEMS = [
  { to: '/', label: 'Exploration', icon: Compass, end: true },
  { to: '/carte', label: 'Carte', icon: Map },
  { to: '/ambiances', label: 'Ambiances', icon: Music },
  { to: '/personnages', label: 'Fiches', icon: Users },
  { to: '/inventaire', label: 'Inventaire', icon: Backpack },
  { to: '/journal', label: 'Journal', icon: ScrollText },
] as const;

const INDICATOR_SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const;

function RailLink({
  to,
  label,
  icon: Icon,
  end,
  dot,
}: {
  to: string;
  label: string;
  icon: typeof Compass;
  end?: boolean;
  dot?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex h-[64px] w-full shrink-0 [@media(max-height:700px)]:h-[54px] flex-col items-center justify-center gap-1 rounded-lg transition-colors duration-300',
          isActive ? 'text-gold-200' : 'text-parchment-300 hover:bg-parchment-100/5 hover:text-parchment-100',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <>
              {/* Fond et filet doré : ils glissent d'une entrée à l'autre. */}
              <motion.span layoutId="rail-bg" className="absolute inset-0 rounded-lg bg-gold-300/12" transition={INDICATOR_SPRING} />
              <motion.span
                layoutId="rail-bar"
                className="absolute left-0 top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-r bg-gold-300 shadow-[0_0_10px_rgb(227_194_122/0.7)]"
                transition={INDICATOR_SPRING}
              />
            </>
          )}
          <Icon
            className="relative size-6 transition-transform duration-300 group-hover:-translate-y-0.5 group-active:scale-90"
            strokeWidth={1.6}
          />
          <span className="relative max-w-full truncate font-display text-[0.58rem] font-semibold uppercase tracking-[0.06em]">
            {label}
          </span>
          {dot && (
            <span className="absolute right-3 top-3 flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-ember-500/60 [animation-duration:2.4s]" />
              <span className="relative size-2.5 rounded-full bg-ember-500 ring-2 ring-leather-900" />
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function NavRail({ backupDue, onRequestMode }: { backupDue: boolean; onRequestMode: () => void }) {
  const mode = useSession((s) => s.mode);
  const prep = mode === 'preparation';
  return (
    <nav
      aria-label="Navigation principale"
      className="flex w-[92px] shrink-0 flex-col items-center gap-1 border-r border-bronze-500/25 px-2 pb-3 tex-wood"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingLeft: 'max(0.5rem, env(safe-area-inset-left))' }}
    >
      <div className="mb-2 flex flex-col items-center [@media(max-height:700px)]:mb-0" aria-hidden>
        <img src="./icons/favicon.svg" alt="" className="size-11 animate-compass-in drop-shadow [@media(max-height:700px)]:size-9" />
      </div>
      {ITEMS.map((it) => (
        <RailLink key={it.to} {...it} />
      ))}
      <div className="flex-1" />
      <RailLink to="/reglages" label="Réglages" icon={Settings} dot={backupDue} />
      <button
        type="button"
        onClick={onRequestMode}
        aria-pressed={prep}
        title={prep ? 'Revenir au mode Jeu' : 'Passer en mode Préparation'}
        className={cn(
          'mt-1 flex h-[72px] w-full shrink-0 [@media(max-height:700px)]:h-[60px] flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border transition-colors duration-500 active:scale-95',
          prep
            ? 'border-ember-500/70 bg-ember-500/15 text-gold-200'
            : 'border-bronze-500/30 text-parchment-300 hover:border-bronze-400/60 hover:text-parchment-100',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mode}
            className="flex flex-col items-center gap-1"
            initial={{ opacity: 0, y: 10, rotate: prep ? -20 : 0 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {prep ? <Feather className="size-6" strokeWidth={1.6} /> : <Lock className="size-6" strokeWidth={1.6} />}
            <span className="max-w-full truncate font-display text-[0.58rem] font-semibold uppercase tracking-[0.06em]">
              {prep ? 'Préparation' : 'Jeu'}
            </span>
          </motion.span>
        </AnimatePresence>
      </button>
    </nav>
  );
}
