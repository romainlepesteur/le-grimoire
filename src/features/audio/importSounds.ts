import type { MediaMeta } from '@/domain/schemas';
import { addMedia } from '@/services/db/media';
import { probeAudio, soundNameFromFile } from '@/services/media/audio';
import { toast } from '@/stores/toasts';

/** Importe plusieurs fichiers audio ; les fichiers refusés sont signalés sans bloquer les autres. */
export async function importSounds(campaignId: string, files: FileList | File[]): Promise<MediaMeta[]> {
  const added: MediaMeta[] = [];
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    try {
      const { duration } = await probeAudio(file);
      added.push(await addMedia(campaignId, file, 'audio', { duration, name: soundNameFromFile(file.name) }));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (added.length) {
    toast({
      tone: 'success',
      title: added.length === 1 ? `Son ajouté : ${added[0].name}` : `${added.length} sons ajoutés à la bibliothèque`,
    });
  }
  if (errors.length) {
    toast({ tone: 'error', title: errors.length === 1 ? 'Un fichier a été refusé' : `${errors.length} fichiers refusés`, message: errors.join(' ') });
  }
  return added;
}
