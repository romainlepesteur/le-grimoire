import { AnimatePresence, motion } from 'motion/react';
import { SlidersHorizontal, Volume2 } from 'lucide-react';
import { useSettings } from '@/hooks/data';
import { unlockAudio, useAudio } from '@/stores/audio';
import { Button } from '@/ui/Button';
import { Panel, SectionTitle } from '@/ui/Panel';
import { Equalizer } from './AudioControl';

/** Encart « Ambiance » de l'écran Exploration. */
export function AmbiancePanel() {
  const { unlocked, running, nowPlaying, setMixerOpen } = useAudio();
  const muted = useSettings().muted;
  const playing = unlocked && running && !!nowPlaying && !muted;

  const detail = !nowPlaying
    ? 'Aucune ambiance pour ce lieu'
    : nowPlaying.source === 'manuel'
      ? 'Choisie manuellement'
      : nowPlaying.source === 'herite'
        ? `Héritée de ${nowPlaying.inheritedFrom}`
        : 'Ambiance du lieu';

  return (
    <Panel tone="leather" className="flex items-center gap-3 px-5 py-3.5 [@media(max-height:680px)]:py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SectionTitle className="text-bronze-400">Ambiance</SectionTitle>
          <Equalizer active={playing} className={playing ? 'text-gold-300' : 'text-parchment-400/60'} />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${nowPlaying?.ambianceId ?? 'none'}-${nowPlaying?.source}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
          >
            <p className="truncate text-lg text-parchment-50">{nowPlaying?.name ?? '—'}</p>
            <p className="truncate text-sm text-parchment-400">
              {muted && unlocked ? 'Son coupé' : !unlocked && nowPlaying ? 'En attente d’activation du son' : detail}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
      {unlocked ? (
        <Button size="sm" variant="secondary" icon={<SlidersHorizontal className="size-4" />} onClick={() => setMixerOpen(true)}>
          Changer
        </Button>
      ) : (
        <Button size="sm" variant="primary" icon={<Volume2 className="size-4" />} onClick={() => void unlockAudio()}>
          Activer
        </Button>
      )}
    </Panel>
  );
}
