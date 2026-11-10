/**
 * Brouillard de guerre peint à la main.
 *
 * Deux canevas de même taille (≈ 1600 px de large) :
 * - `mask` : opaque là où la carte est révélée (c'est lui qui est enregistré) ;
 * - `view` : ce qu'on affiche par-dessus la carte = texture de brume, trouée par le masque.
 *
 * Le pinceau est doux (dégradé radial) : les bords révélés se fondent dans la brume.
 * Chaque coup de pinceau peut être annulé (10 niveaux, gardés en mémoire seulement).
 */

export type BrushMode = 'reveal' | 'cover';

const UNDO_LEVELS = 10;

/** Pseudo-aléatoire reproductible : la brume a toujours le même aspect pour une carte donnée. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Texture de brume : nuées sombres superposées, légèrement teintées de brun. */
function paintMist(w: number, h: number, seed: number): HTMLCanvasElement {
  const small = makeCanvas(Math.max(8, Math.round(w / 6)), Math.max(8, Math.round(h / 6)));
  const g = small.getContext('2d')!;
  const rnd = seeded(seed);
  g.fillStyle = '#17110c';
  g.fillRect(0, 0, small.width, small.height);
  const blobs = 70;
  for (let i = 0; i < blobs; i++) {
    const x = rnd() * small.width;
    const y = rnd() * small.height;
    const r = (0.08 + rnd() * 0.22) * Math.max(small.width, small.height);
    const light = 40 + rnd() * 45;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${light + 18}, ${light + 8}, ${light}, ${0.18 + rnd() * 0.2})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grain fin pour éviter l'aspect « dégradé numérique ».
  const img = g.getImageData(0, 0, small.width, small.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const big = makeCanvas(w, h);
  const bg = big.getContext('2d')!;
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(small, 0, 0, w, h);
  return big;
}

export class Fog {
  readonly mask: HTMLCanvasElement;
  readonly view: HTMLCanvasElement;
  private mist: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private vctx: CanvasRenderingContext2D;
  private undoStack: HTMLCanvasElement[] = [];
  private last: { x: number; y: number } | null = null;
  private frame = 0;
  /** Opacité de la brume (1 en mode Jeu ; plus légère en Préparation pour voir la carte dessous). */
  opacity = 1;

  constructor(
    readonly width: number,
    readonly height: number,
    seed = 7,
  ) {
    this.mask = makeCanvas(width, height);
    this.view = makeCanvas(width, height);
    this.mctx = this.mask.getContext('2d', { willReadFrequently: false })!;
    this.vctx = this.view.getContext('2d')!;
    this.mist = paintMist(width, height, seed);
  }

  /** Charge un masque enregistré (data URL PNG). */
  async load(dataUrl: string): Promise<void> {
    this.mctx.clearRect(0, 0, this.width, this.height);
    if (dataUrl) {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      this.mctx.drawImage(img, 0, 0, this.width, this.height);
    }
    this.undoStack = [];
    this.render();
  }

  toDataURL(): string {
    return this.mask.toDataURL('image/png');
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  render = () => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const g = this.vctx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.width, this.height);
    g.globalAlpha = this.opacity;
    g.drawImage(this.mist, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
  };

  private scheduleRender() {
    if (!this.frame) this.frame = requestAnimationFrame(this.render);
  }

  private snapshot() {
    const copy = makeCanvas(this.width, this.height);
    copy.getContext('2d')!.drawImage(this.mask, 0, 0);
    this.undoStack.push(copy);
    if (this.undoStack.length > UNDO_LEVELS) this.undoStack.shift();
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.mctx.globalCompositeOperation = 'source-over';
    this.mctx.clearRect(0, 0, this.width, this.height);
    this.mctx.drawImage(prev, 0, 0);
    this.render();
    return true;
  }

  /** Révèle (ou recouvre) toute la carte, en gardant la possibilité d'annuler. */
  fill(mode: BrushMode) {
    this.snapshot();
    this.mctx.globalCompositeOperation = 'source-over';
    this.mctx.clearRect(0, 0, this.width, this.height);
    if (mode === 'reveal') {
      this.mctx.fillStyle = '#fff';
      this.mctx.fillRect(0, 0, this.width, this.height);
    }
    this.render();
  }

  private stamp(x: number, y: number, r: number, mode: BrushMode) {
    const g = this.mctx;
    const grad = g.createRadialGradient(x, y, r * 0.35, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = mode === 'reveal' ? 'source-over' : 'destination-out';
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  beginStroke(x: number, y: number, r: number, mode: BrushMode) {
    this.snapshot();
    this.last = { x, y };
    this.stamp(x, y, r, mode);
    this.scheduleRender();
  }

  /** Prolonge le trait : tampons rapprochés pour un tracé continu même en geste rapide. */
  continueStroke(x: number, y: number, r: number, mode: BrushMode) {
    if (!this.last) return this.beginStroke(x, y, r, mode);
    const dx = x - this.last.x;
    const dy = y - this.last.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, r * 0.3);
    if (dist < step) return;
    const n = Math.floor(dist / step);
    for (let i = 1; i <= n; i++) this.stamp(this.last.x + (dx * i) / n, this.last.y + (dy * i) / n, r, mode);
    this.last = { x, y };
    this.scheduleRender();
  }

  endStroke() {
    this.last = null;
  }

  /** Annule le trait en cours (un deuxième doigt est arrivé : c'était un zoom, pas un coup de pinceau). */
  cancelStroke() {
    if (this.last) this.undo();
    this.last = null;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.undoStack = [];
  }
}

/** Décalage stable (0..1) tiré d'un identifiant : sert à décentrer la zone d'une rumeur. */
export function hashUnit(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Centre affiché d'une rumeur : décalé de façon stable jusqu'à 55 % du rayon,
 * pour que la zone ne trahisse pas la position exacte.
 */
export function rumorCenter(m: { id: string; x: number; y: number; radius: number }): { x: number; y: number } {
  const angle = hashUnit(m.id, 1) * Math.PI * 2;
  const dist = (0.2 + hashUnit(m.id, 2) * 0.35) * m.radius;
  return { x: m.x + Math.cos(angle) * dist, y: m.y + Math.sin(angle) * dist };
}
