import type { AudioBus } from '@/domain/schemas';

/**
 * Moteur audio multicouche (Web Audio API), sans dépendance.
 *
 *   couche → volume de la couche → fondu → bus (musique | bruitages) → général → sortie
 *
 * - Les boucles courtes sont décodées en mémoire : bouclage sans « blanc ».
 * - Les longues pistes (musiques) sont lues en flux depuis le fichier local, sans tout décoder.
 * - Les sons ponctuels sont rejoués au hasard dans un intervalle, avec une légère variation
 *   de volume et de position stéréo pour éviter l'effet « disque rayé ».
 * - Changer d'ambiance fait un fondu enchaîné ; une boucle commune aux deux ambiances
 *   (même fichier) continue sans interruption.
 *
 * Les navigateurs interdisent le son avant un geste de l'utilisateur : `unlock()` doit être
 * appelé depuis un toucher (bouton « Activer l'ambiance sonore »).
 */

export interface LayerSpec {
  /** Identifiant de la couche dans son ambiance. */
  id: string;
  mediaId: string;
  bus: AudioBus;
  volume: number;
  loop: boolean;
  intervalMin: number;
  intervalMax: number;
  /** Durée connue du fichier (secondes), pour choisir décodage ou lecture en flux. */
  duration: number | null;
  size: number;
}

export interface AmbianceSpec {
  id: string;
  layers: LayerSpec[];
}

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export interface EngineHooks {
  loadBlob: (mediaId: string) => Promise<Blob | undefined>;
  onStateChange?: (s: { unlocked: boolean; running: boolean }) => void;
  onError?: (mediaId: string, message: string) => void;
}

const FADE_IN = 2.5;
const FADE_OUT = 2.5;
/** Au-delà, le fichier est lu en flux plutôt que décodé (mémoire de la tablette). */
const DECODE_MAX_SECONDS = 50;
const DECODE_MAX_BYTES_UNKNOWN = 1.5 * 1024 * 1024;
const BUFFER_CACHE_SIZE = 16;

/** Courbe perceptive : un curseur à 50 % sonne « à moitié aussi fort ». */
export const perceptual = (v: number) => Math.max(0, Math.min(1, v)) ** 2;

/** Clé d'une couche active : une boucle est identifiée par son fichier pour survivre aux changements d'ambiance. */
export function layerKeys(spec: AmbianceSpec): string[] {
  const seen = new Map<string, number>();
  return spec.layers.map((l) => {
    const base = l.loop ? `loop:${l.bus}:${l.mediaId}` : `rnd:${spec.id}:${l.id}:${l.bus}:${l.mediaId}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  });
}

export function randomBetween(min: number, max: number, rnd = Math.random): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + (hi - lo) * rnd();
}

interface ActiveLayer {
  key: string;
  spec: LayerSpec;
  volume: GainNode;
  fade: GainNode;
  disposed: boolean;
  cleanup: (() => void)[];
  timer?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<AudioBus, GainNode>;
  private active = new Map<string, ActiveLayer>();
  private desired: AmbianceSpec | null = null;
  private volumes: Volumes = { master: 0.8, music: 0.7, sfx: 0.9, muted: false };
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private failed = new Set<string>();

  constructor(private hooks: EngineHooks) {}

  get unlocked(): boolean {
    return this.ctx != null;
  }

  get currentId(): string | null {
    return this.desired?.id ?? null;
  }

  /** À appeler depuis un geste de l'utilisateur. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'playback' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.buses = { music: ctx.createGain(), sfx: ctx.createGain() };
      this.buses.music.connect(this.master);
      this.buses.sfx.connect(this.master);
      this.applyVolumes(0);
      ctx.onstatechange = () => this.emit();
      // Android peut suspendre le son (appel, mise en veille) : le premier toucher le relance.
      const resume = () => {
        if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
      };
      document.addEventListener('pointerdown', resume, { passive: true });
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && resume());
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
    this.emit();
    if (this.desired) this.reconcile(this.desired);
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes(0.15);
  }

  /** Joue une ambiance (fondu enchaîné), ou le silence avec `null`. */
  play(spec: AmbianceSpec | null): void {
    this.desired = spec;
    if (this.ctx) this.reconcile(spec);
  }

  // -------------------------------------------------------------------------

  private emit() {
    this.hooks.onStateChange?.({ unlocked: this.unlocked, running: this.ctx?.state === 'running' });
  }

  private applyVolumes(ramp: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      if (ramp > 0) g.gain.linearRampToValueAtTime(v, t + ramp);
      else g.gain.setValueAtTime(v, t);
    };
    set(this.master, this.volumes.muted ? 0 : perceptual(this.volumes.master));
    set(this.buses.music, perceptual(this.volumes.music));
    set(this.buses.sfx, perceptual(this.volumes.sfx));
  }

  private reconcile(spec: AmbianceSpec | null) {
    const ctx = this.ctx!;
    const wanted = new Map<string, LayerSpec>();
    if (spec) layerKeys(spec).forEach((k, i) => wanted.set(k, spec.layers[i]));

    for (const [key, layer] of this.active) {
      if (!wanted.has(key)) this.fadeOutAndDispose(layer);
    }
    for (const [key, ls] of wanted) {
      const existing = this.active.get(key);
      if (existing) {
        // Même couche : on ajuste simplement le volume et l'intervalle.
        existing.spec = ls;
        const t = ctx.currentTime;
        existing.volume.gain.cancelScheduledValues(t);
        existing.volume.gain.setValueAtTime(existing.volume.gain.value, t);
        existing.volume.gain.linearRampToValueAtTime(perceptual(ls.volume), t + 0.2);
      } else {
        this.startLayer(key, ls);
      }
    }
  }

  private fadeOutAndDispose(layer: ActiveLayer) {
    const ctx = this.ctx!;
    this.active.delete(layer.key);
    layer.disposed = true;
    window.clearTimeout(layer.timer);
    const t = ctx.currentTime;
    layer.fade.gain.cancelScheduledValues(t);
    layer.fade.gain.setValueAtTime(layer.fade.gain.value, t);
    layer.fade.gain.linearRampToValueAtTime(0, t + FADE_OUT);
    window.setTimeout(() => {
      layer.cleanup.forEach((fn) => fn());
      layer.fade.disconnect();
      layer.volume.disconnect();
    }, FADE_OUT * 1000 + 100);
  }

  private startLayer(key: string, spec: LayerSpec) {
    const ctx = this.ctx!;
    const volume = ctx.createGain();
    const fade = ctx.createGain();
    volume.gain.value = perceptual(spec.volume);
    fade.gain.value = 0;
    volume.connect(fade).connect(this.buses[spec.bus]);
    const layer: ActiveLayer = { key, spec, volume, fade, disposed: false, cleanup: [] };
    this.active.set(key, layer);

    const t = ctx.currentTime;
    fade.gain.setValueAtTime(0, t);
    fade.gain.linearRampToValueAtTime(1, t + (spec.loop ? FADE_IN : 0.05));

    if (spec.loop) void this.startLoop(layer);
    else this.scheduleRandom(layer, true);
  }

  private shouldDecode(spec: LayerSpec): boolean {
    return spec.duration != null ? spec.duration <= DECODE_MAX_SECONDS : spec.size <= DECODE_MAX_BYTES_UNKNOWN;
  }

  private async getBuffer(mediaId: string): Promise<AudioBuffer> {
    let p = this.buffers.get(mediaId);
    if (!p) {
      p = (async () => {
        const blob = await this.hooks.loadBlob(mediaId);
        if (!blob) throw new Error('Fichier introuvable.');
        return this.ctx!.decodeAudioData(await blob.arrayBuffer());
      })();
      this.buffers.set(mediaId, p);
      p.catch(() => this.buffers.delete(mediaId));
      if (this.buffers.size > BUFFER_CACHE_SIZE) {
        const oldest = this.buffers.keys().next().value;
        if (oldest && !this.isInUse(oldest)) this.buffers.delete(oldest);
      }
    } else {
      // Rafraîchit l'ordre d'utilisation (LRU).
      this.buffers.delete(mediaId);
      this.buffers.set(mediaId, p);
    }
    return p;
  }

  private isInUse(mediaId: string) {
    for (const l of this.active.values()) if (l.spec.mediaId === mediaId) return true;
    return false;
  }

  private fail(layer: ActiveLayer, e: unknown) {
    const id = layer.spec.mediaId;
    if (this.failed.has(id)) return;
    this.failed.add(id);
    this.hooks.onError?.(id, e instanceof Error ? e.message : 'Lecture impossible.');
  }

  private async startLoop(layer: ActiveLayer) {
    const ctx = this.ctx!;
    try {
      if (this.shouldDecode(layer.spec)) {
        const buffer = await this.getBuffer(layer.spec.mediaId);
        if (layer.disposed) return;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(layer.volume);
        // Départ à une position aléatoire : deux passages au même lieu ne sonnent pas identiques.
        src.start(0, buffer.duration > 4 ? Math.random() * buffer.duration : 0);
        layer.cleanup.push(() => {
          try {
            src.stop();
          } catch {
            /* déjà arrêtée */
          }
          src.disconnect();
        });
      } else {
        const blob = await this.hooks.loadBlob(layer.spec.mediaId);
        if (!blob) throw new Error('Fichier introuvable.');
        if (layer.disposed) return;
        const url = URL.createObjectURL(blob);
        const el = new Audio();
        el.loop = true;
        el.preload = 'auto';
        el.src = url;
        const node = ctx.createMediaElementSource(el);
        node.connect(layer.volume);
        layer.cleanup.push(() => {
          el.pause();
          el.removeAttribute('src');
          el.load();
          node.disconnect();
          URL.revokeObjectURL(url);
        });
        await el.play();
      }
    } catch (e) {
      if (!layer.disposed) this.fail(layer, e);
    }
  }

  private scheduleRandom(layer: ActiveLayer, first = false) {
    if (layer.disposed) return;
    const { intervalMin, intervalMax } = layer.spec;
    // Le premier déclenchement arrive plus tôt, pour que l'ambiance s'installe vite.
    const delay = first ? randomBetween(Math.min(3, intervalMin), intervalMin) : randomBetween(intervalMin, intervalMax);
    layer.timer = window.setTimeout(() => {
      void this.fireOnce(layer).finally(() => this.scheduleRandom(layer));
    }, delay * 1000);
  }

  private async fireOnce(layer: ActiveLayer) {
    if (layer.disposed) return;
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    try {
      const pan = ctx.createStereoPanner();
      const gain = ctx.createGain();
      pan.pan.value = randomBetween(-0.55, 0.55);
      gain.gain.value = randomBetween(0.7, 1);
      gain.connect(pan).connect(layer.volume);
      if (this.shouldDecode(layer.spec)) {
        const buffer = await this.getBuffer(layer.spec.mediaId);
        if (layer.disposed) return;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = randomBetween(0.96, 1.04);
        src.connect(gain);
        src.onended = () => {
          src.disconnect();
          gain.disconnect();
          pan.disconnect();
        };
        src.start();
      } else {
        const blob = await this.hooks.loadBlob(layer.spec.mediaId);
        if (!blob || layer.disposed) return;
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        const node = ctx.createMediaElementSource(el);
        node.connect(gain);
        const done = () => {
          node.disconnect();
          gain.disconnect();
          pan.disconnect();
          URL.revokeObjectURL(url);
        };
        const stop = () => {
          el.pause();
          done();
        };
        el.onended = () => {
          done();
          layer.cleanup = layer.cleanup.filter((fn) => fn !== stop);
        };
        layer.cleanup.push(stop);
        await el.play();
      }
    } catch (e) {
      this.fail(layer, e);
    }
  }
}
