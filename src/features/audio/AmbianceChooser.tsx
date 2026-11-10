import { motion } from 'motion/react';
import { Check, MapPin, VolumeX } from 'lucide-react';
import type { Ambiance } from '@/domain/schemas';
import { useAudio, type AmbianceOverride } from '@/stores/audio';
import { cn } from '@/ui/cn';
import { EASE_OUT } from '@/ui/motion';

function groupByCategory(list: Ambiance[]): [string, Ambiance[]][] {
  const m = new Map<string, Ambiance[]>();
  for (const a of [...list].sort((x, y) => x.name.localeCompare(y.name, 'fr'))) {
    m.set(a.category || 'Autre', [...(m.get(a.category || 'Autre') ?? []), a]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
}

/**
 * Choix rapide de l'ambiance pendant la partie : suivre le lieu, silence, ou une ambiance
 * précise (un combat éclate, la tension monte…). Ce n'est qu'un réglage de séance,
 * il ne modifie pas la campagne : disponible en mode Jeu.
 */
export function AmbianceChooser({ ambiances, placeAmbianceName }: { ambiances: Ambiance[]; placeAmbianceName: string | null }) {
  const override = useAudio((s) => s.override);
  const setOverride = useAudio((s) => s.setOverride);
  const isSel = (o: AmbianceOverride) =>
    o === null ? override === null : o === 'silence' ? override === 'silence' : typeof override === 'object' && override?.ambianceId === o.ambianceId;

  const chip = (o: AmbianceOverride, label: string, sub: string | null, icon?: React.ReactNode, key?: string) => (
    <button
      key={key ?? label}
      type="button"
      onClick={() => setOverride(o)}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.98]',
        isSel(o) ? 'border-gold-300/60 bg-gold-300/12 text-gold-200' : 'border-bronze-500/25 text-parchment-100 hover:border-bronze-400/60 hover:bg-parchment-100/5',
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">{isSel(o) ? <Check className="size-5" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg leading-tight">{label}</span>
        {sub && <span className="block truncate text-sm text-parchment-400">{sub}</span>}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {chip(null, 'Suivre le lieu', placeAmbianceName ?? 'Ce lieu n’a pas d’ambiance', <MapPin className="size-5 text-bronze-400" />)}
        {chip('silence', 'Silence', 'Tout s’arrête en fondu', <VolumeX className="size-5 text-bronze-400" />)}
      </div>
      {groupByCategory(ambiances).map(([cat, list], gi) => (
        <motion.section
          key={cat}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 * gi, ease: EASE_OUT }}
        >
          <h3 className="mb-1.5 px-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-bronze-400">{cat}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((a) =>
              chip({ ambianceId: a.id }, a.name, `${a.layers.length} couche${a.layers.length > 1 ? 's' : ''}`, undefined, a.id),
            )}
          </div>
        </motion.section>
      ))}
      {ambiances.length === 0 && (
        <p className="px-1 text-base italic text-parchment-400">
          Aucune ambiance pour l’instant. Créez-en une en mode Préparation, depuis l’écran Ambiances.
        </p>
      )}
    </div>
  );
}
