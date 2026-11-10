import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Location } from '@/domain/schemas';
import { useSettings } from '@/hooks/data';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { AmbientDust } from '@/ui/AmbientDust';
import { EmptyIllustration } from '@/ui/EmptyIllustration';
import { cn } from '@/ui/cn';

function Layer({ location, ambient }: { location: Location; ambient: boolean }) {
  const url = useMediaUrl(location.imageId);
  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-leather-950"
      initial={{ opacity: 0, scale: 1.035 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { duration: 1.1, ease: [0.4, 0, 0.2, 1] }, scale: { duration: 2.4, ease: [0.2, 0.8, 0.2, 1] } }}
    >
      {location.imageId ? (
        url && (
          <img
            src={url}
            alt={location.name}
            draggable={false}
            className={cn('size-full object-cover', ambient && 'animate-slow-zoom')}
          />
        )
      ) : (
        <EmptyIllustration theme={location.theme} animated={ambient} />
      )}
    </motion.div>
  );
}

/**
 * Scène du lieu courant : fondu enchaîné entre l'ancien et le nouveau lieu,
 * lent mouvement de caméra et poussières en suspension (désactivables dans Réglages).
 */
export function LocationIllustration({ location, className }: { location: Location; className?: string }) {
  const settings = useSettings();
  const reduced = useReducedMotion();
  const ambient = settings.ambientEffects && !reduced;

  return (
    <div className={cn('absolute inset-0 overflow-hidden bg-leather-950', className)}>
      <AnimatePresence initial={false}>
        <Layer key={location.id} location={location} ambient={ambient} />
      </AnimatePresence>
      {ambient && <AmbientDust className="pointer-events-none absolute inset-0 size-full" />}
    </div>
  );
}
