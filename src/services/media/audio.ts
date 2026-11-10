/** Contrôle des fichiers audio importés. */

const AUDIO_EXT = /\.(mp3|ogg|oga|opus|m4a|aac|wav|webm|flac)$/i;
export const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.opus,.m4a,.aac,.wav,.webm,.flac';
export const AUDIO_MAX_BYTES = 60 * 1024 * 1024;

export class AudioImportError extends Error {}

/** Nom lisible tiré du nom de fichier : « pluie_legere-loop.mp3 » → « pluie legere loop ». */
export function soundNameFromFile(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Son sans nom';
}

/** Vérifie qu'un fichier est un son lisible et renvoie sa durée (secondes). */
export async function probeAudio(file: File): Promise<{ duration: number | null }> {
  if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) {
    throw new AudioImportError(`« ${file.name} » n’est pas un fichier audio.`);
  }
  if (file.size > AUDIO_MAX_BYTES) {
    throw new AudioImportError(`« ${file.name} » est trop lourd (60 Mo au maximum). Préférez un MP3 ou un OGG compressé.`);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const el = new Audio();
      const timer = window.setTimeout(() => resolve({ duration: null }), 8000);
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve({ duration: Number.isFinite(el.duration) ? el.duration : null });
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        reject(new AudioImportError(`« ${file.name} » ne peut pas être lu par ce navigateur.`));
      };
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
