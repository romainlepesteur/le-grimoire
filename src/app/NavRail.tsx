import { NavLink } from 'react-router';
import { Backpack, Compass, Feather, Lock, Map, ScrollText, Settings, Users } from 'lucide-react';
import { useSession } from '@/stores/session';
import { cn } from '@/ui/cn';

const ITEMS = [
  { to: '/', label: 'Exploration', icon: Compass, end: true },
  { to: '/carte', label: 'Carte', icon: Map },
  { to: '/personnages', label: 'Fiches', icon: Users },
  { to: '/inventaire', label: 'Inventaire', icon: Backpack },
  { to: '/journal', label: 'Journal', icon: ScrollText },
] as const;

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
          'group relative flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-lg transition-colors',
          isActive ? 'bg-gold-300/12 text-gold-200' : 'text-parchment-300 hover:bg-parchment-100/5 hover:text-parchment-100',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-r bg-gold-300 transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Icon className="size-6" strokeWidth={1.6} />
          <span className="max-w-full truncate font-display text-[0.58rem] font-semibold uppercase tracking-[0.06em]">{label}</span>
          {dot && <span className="absolute right-3 top-3 size-2.5 rounded-full bg-ember-500 ring-2 ring-leather-900" />}
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
      <div className="mb-2 flex flex-col items-center" aria-hidden>
        <img src="./icons/favicon.svg" alt="" className="size-11 drop-shadow" />
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
          'mt-1 flex h-[72px] w-full flex-col items-center justify-center gap-1 rounded-lg border transition-colors',
          prep
            ? 'border-ember-500/70 bg-ember-500/15 text-gold-200'
            : 'border-bronze-500/30 text-parchment-300 hover:border-bronze-400/60 hover:text-parchment-100',
        )}
      >
        {prep ? <Feather className="size-6" strokeWidth={1.6} /> : <Lock className="size-6" strokeWidth={1.6} />}
        <span className="max-w-full truncate font-display text-[0.58rem] font-semibold uppercase tracking-[0.06em]">
          {prep ? 'Préparation' : 'Jeu'}
        </span>
      </button>
    </nav>
  );
}
