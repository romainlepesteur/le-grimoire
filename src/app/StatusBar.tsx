import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Dices, Expand, MapPin, Music, Shrink, WifiOff } from 'lucide-react';
import { useCurrentPlace } from '@/hooks/data';
import { useFullscreen, useOnline } from '@/hooks/device';
import { useSession } from '@/stores/session';
import { Button, IconButton } from '@/ui/Button';

/** Barre inférieure persistante : lieu courant, ambiance sonore, plein écran, dés. */
export function StatusBar() {
  const { location } = useCurrentPlace();
  const setDiceOpen = useSession((s) => s.setDiceOpen);
  const fullscreen = useFullscreen();
  const online = useOnline();

  return (
    <footer
      className="flex h-16 shrink-0 items-center gap-4 border-t border-bronze-500/25 px-4 tex-wood"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
    >
      <Link to="/" className="flex min-w-0 max-w-[32%] items-center gap-2 text-parchment-200 hover:text-gold-200">
        <MapPin className="size-5 shrink-0 text-bronze-400" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={location?.id ?? 'none'}
            className="truncate font-display text-sm tracking-wider"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {location?.name ?? '—'}
          </motion.span>
        </AnimatePresence>
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-parchment-400">
        <Music className="size-5 shrink-0" />
        <span className="truncate text-base italic">Ambiance sonore — disponible en phase 2</span>
      </div>

      {!online && (
        <span className="flex items-center gap-1.5 text-sm text-parchment-300" title="Hors ligne : tout fonctionne localement">
          <WifiOff className="size-4" /> Hors ligne
        </span>
      )}
      {fullscreen.supported && (
        <IconButton label={fullscreen.active ? 'Quitter le plein écran' : 'Plein écran'} onClick={fullscreen.toggle}>
          {fullscreen.active ? <Shrink className="size-5" /> : <Expand className="size-5" />}
        </IconButton>
      )}
      <Button
        variant="primary"
        size="md"
        icon={<Dices className="size-6" strokeWidth={1.7} />}
        onClick={() => setDiceOpen(true)}
        className="rounded-full px-5 font-display text-base tracking-wider"
      >
        Dés
      </Button>
    </footer>
  );
}
