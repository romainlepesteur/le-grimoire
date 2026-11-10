import { create } from 'zustand';
import { AudioEngine } from '@/services/audio/engine';
import { db } from '@/services/db/database';
import { getMediaBlob } from '@/services/db/media';
import { toast } from './toasts';

/**
 * Ambiance choisie à la main pendant la partie (combat, tension…).
 * `null` : on suit l'ambiance du lieu. Elle est oubliée au prochain changement de lieu.
 */
export type AmbianceOverride = null | 'silence' | { ambianceId: string };

export interface NowPlaying {
  ambianceId: string;
  name: string;
  source: 'lieu' | 'herite' | 'manuel';
  inheritedFrom: string | null;
  layerCount: number;
}

interface AudioState {
  unlocked: boolean;
  running: boolean;
  override: AmbianceOverride;
  nowPlaying: NowPlaying | null;
  mixerOpen: boolean;
  setOverride: (o: AmbianceOverride) => void;
  setNowPlaying: (n: NowPlaying | null) => void;
  setMixerOpen: (v: boolean) => void;
}

export const useAudio = create<AudioState>((set) => ({
  unlocked: false,
  running: false,
  override: null,
  nowPlaying: null,
  mixerOpen: false,
  setOverride: (override) => set({ override }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  setMixerOpen: (mixerOpen) => set({ mixerOpen }),
}));

export const audioEngine = new AudioEngine({
  loadBlob: getMediaBlob,
  onStateChange: ({ unlocked, running }) => useAudio.setState({ unlocked, running }),
  onError: (mediaId, message) => {
    void db.mediaMeta.get(mediaId).then((m) =>
      toast({
        tone: 'warning',
        title: `Son illisible : ${m?.name ?? 'fichier inconnu'}`,
        message: `${message} Essayez de le convertir en MP3 ou OGG.`,
      }),
    );
  },
});

/** À appeler depuis un toucher (contrainte des navigateurs). */
export function unlockAudio(): Promise<void> {
  return audioEngine.unlock();
}
