import { AnimatePresence, motion } from 'motion/react';
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { useSettings } from '@/hooks/data';
import { updateSettings } from '@/services/db/settings';
import { unlockAudio, useAudio } from '@/stores/audio';
import { IconButton } from '@/ui/Button';
import { cn } from '@/ui/cn';

/** Petit égaliseur animé : une ambiance joue. */
export function Equalizer({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={cn('flex h-4 items-end gap-[3px]', className)} aria-hidden>
      {[0, 0.25, 0.5, 0.12].map((d, i) => (
        <span
          key={i}
          className={cn('w-[3px] rounded-full bg-current', active ? 'h-full animate-eq' : 'h-1 opacity-60')}
          style={{ animationDelay: `${-d * 2}s`, animationDuration: `${0.9 + i * 0.17}s` }}
        />
      ))}
    </span>
  );
}

/** Contrôle sonore de la barre inférieure. */
export function AudioControl() {
  const { unlocked, running, nowPlaying, setMixerOpen } = useAudio();
  const settings = useSettings();
  const muted = settings.muted;

  if (!unlocked) {
    return (
      <button
        type="button"
        onClick={() => void unlockAudio()}
        className="sheen flex h-11 min-w-0 items-center gap-2.5 rounded-full border border-bronze-500/60 bg-leather-850/80 px-4 text-parchment-100 transition-colors hover:border-gold-300/70 hover:text-gold-200 active:scale-[0.97]"
      >
        <Volume2 className="size-5 shrink-0 text-gold-300" />
        <span className="truncate text-base">Activer l’ambiance sonore</span>
      </button>
    );
  }

  const playing = !!nowPlaying && running && !muted;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => setMixerOpen(true)}
        className="flex h-11 min-w-0 items-center gap-2.5 rounded-full px-3 text-parchment-200 transition-colors hover:bg-parchment-100/5 hover:text-gold-200"
        title="Ambiance et volumes"
      >
        <Equalizer active={playing} className={playing ? 'text-gold-300' : 'text-parchment-400'} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={nowPlaying?.ambianceId ?? 'silence'}
            className="truncate text-base"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
          >
            {nowPlaying ? (
              <>
                <span className="font-display tracking-wide">{nowPlaying.name}</span>
                {nowPlaying.source === 'manuel' && <span className="ml-1.5 text-sm italic text-parchment-400">· choix manuel</span>}
              </>
            ) : (
              <span className="italic text-parchment-400">Silence</span>
            )}
          </motion.span>
        </AnimatePresence>
        <SlidersHorizontal className="size-4 shrink-0 text-parchment-400" />
      </button>
      <IconButton label={muted ? 'Rétablir le son' : 'Couper le son'} active={muted} onClick={() => void updateSettings({ muted: !muted })}>
        {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </IconButton>
    </div>
  );
}
