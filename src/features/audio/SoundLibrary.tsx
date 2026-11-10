import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { Check, Pause, Pencil, Play, Trash2, Upload } from 'lucide-react';
import type { MediaMeta } from '@/domain/schemas';
import { deleteSound, mediaUsage, renameMedia } from '@/services/db/media';
import { AUDIO_ACCEPT, formatDuration } from '@/services/media/audio';
import { formatBytes } from '@/services/storage';
import { useIsPrep } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { TextInput } from '@/ui/Field';
import { Panel, SectionTitle } from '@/ui/Panel';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { importSounds } from './importSounds';
import { usePreview } from './preview';
import { useCampaignSounds } from './useAmbianceDirector';

function SoundRow({ sound, usedIn, index }: { sound: MediaMeta; usedIn: string[]; index: number }) {
  const isPrep = useIsPrep();
  const { playingId, toggle } = usePreview();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sound.name);
  const [confirm, setConfirm] = useState(false);
  const playing = playingId === sound.id;

  const save = async () => {
    try {
      await renameMedia(sound.id, name);
      setEditing(false);
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    }
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.03, ease: EASE_OUT }}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-2 py-1.5 transition-colors',
        playing ? 'border-gold-300/50 bg-gold-300/8' : 'border-bronze-500/20',
      )}
    >
      <IconButton label={playing ? 'Arrêter l’écoute' : `Écouter ${sound.name}`} active={playing} onClick={() => void toggle(sound.id)}>
        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
      </IconButton>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={300} aria-label="Nom du son" />
            <IconButton label="Valider" type="submit">
              <Check className="size-5" />
            </IconButton>
          </form>
        ) : (
          <>
            <p className="truncate text-lg text-parchment-50">{sound.name}</p>
            <p className="truncate text-sm text-parchment-400">
              {formatDuration(sound.duration)} · {formatBytes(sound.size)} ·{' '}
              {usedIn.length ? `utilisé dans ${usedIn.join(', ')}` : <span className="italic">inutilisé</span>}
            </p>
          </>
        )}
      </div>
      {isPrep && !editing && (
        <>
          <IconButton label="Renommer" onClick={() => setEditing(true)}>
            <Pencil className="size-5" />
          </IconButton>
          <IconButton label="Supprimer" onClick={() => setConfirm(true)} className="hover:text-blood-500">
            <Trash2 className="size-5" />
          </IconButton>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        danger
        title={`Supprimer « ${sound.name} » ?`}
        message={
          usedIn.length
            ? `Ce son sera retiré de : ${usedIn.join(', ')}. Le fichier sera effacé de l’appareil.`
            : 'Le fichier sera effacé de l’appareil.'
        }
        confirmLabel="Supprimer"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          if (playing) usePreview.getState().stop();
          void deleteSound(sound.id).then(() => toast({ tone: 'success', title: 'Son supprimé' }));
        }}
      />
    </motion.li>
  );
}

export function SoundLibrary({ campaignId }: { campaignId: string }) {
  const isPrep = useIsPrep();
  const sounds = useCampaignSounds(campaignId);
  const usage = useLiveQuery(() => mediaUsage(campaignId), [campaignId]);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const sorted = [...(sounds ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const total = sorted.reduce((s, m) => s + m.size, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel tone="leather" className="px-4 py-4">
        <div className="mb-3 flex items-center gap-3 px-1">
          <div className="min-w-0 flex-1">
            <SectionTitle className="text-bronze-400">Bibliothèque sonore</SectionTitle>
            <p className="text-base text-parchment-400">
              {sorted.length} son{sorted.length > 1 ? 's' : ''} · {formatBytes(total)}
            </p>
          </div>
          {isPrep && (
            <>
              <Button variant="primary" icon={<Upload className="size-5" />} disabled={busy} onClick={() => input.current?.click()}>
                {busy ? 'Import…' : 'Importer des sons'}
              </Button>
              <input
                ref={input}
                type="file"
                accept={AUDIO_ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files?.length) return;
                  setBusy(true);
                  void importSounds(campaignId, files).finally(() => {
                    setBusy(false);
                    e.target.value = '';
                  });
                }}
              />
            </>
          )}
        </div>
        {sorted.length ? (
          <ul className="space-y-1.5">
            {sorted.map((s, i) => (
              <SoundRow key={s.id} sound={s} index={i} usedIn={usage?.get(s.id)?.ambiances ?? []} />
            ))}
          </ul>
        ) : (
          <p className="px-1 py-6 text-center text-lg italic text-parchment-400">
            {isPrep ? 'Aucun son. Importez vos musiques et bruitages (MP3, OGG, M4A, WAV).' : 'Aucun son. L’import se fait en mode Préparation.'}
          </p>
        )}
      </Panel>
      <Panel className="h-fit px-5 py-4">
        <SectionTitle className="text-bronze-700">Conseils</SectionTitle>
        <ul className="mt-2 space-y-2 text-base text-ink-700">
          <li>
            <strong>Musique</strong> : pistes longues (2 à 10 min) en MP3 ou OGG, lues en continu sans saturer la mémoire.
          </li>
          <li>
            <strong>Fond sonore</strong> (pluie, feu, foule) : boucles de 20 à 60 s, idéalement en OGG pour un bouclage
            sans coupure.
          </li>
          <li>
            <strong>Sons ponctuels</strong> (corbeau, cloche, porte) : quelques secondes, rejoués au hasard.
          </li>
          <li>
            Sources gratuites : bibliothèques de sons sous licence libre (CC0). Vérifiez la licence de chaque fichier.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
