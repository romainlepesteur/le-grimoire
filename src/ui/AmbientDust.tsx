import { useEffect, useRef } from 'react';
import { overlayOpen } from './overlay';

/**
 * Poussières en suspension, très discrètes, au-dessus d'une illustration.
 * Canvas léger (≈ 30 images/s, 70 particules max), mis en pause quand l'onglet est masqué.
 */
export function AmbientDust({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    type P = { x: number; y: number; r: number; vx: number; vy: number; phase: number; speed: number };
    let particles: P[] = [];

    const spawn = (anywhere: boolean): P => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: (0.5 + Math.random() * 1.7) * dpr,
      vx: (Math.random() - 0.5) * 0.12 * dpr,
      vy: -(0.03 + Math.random() * 0.12) * dpr,
      phase: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.01,
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      const count = Math.min(70, Math.round((rect.width * rect.height) / 16000));
      particles = Array.from({ length: count }, () => spawn(true));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // ~30 fps suffisent
      if (overlayOpen()) return; // en pause sous un tiroir ou un dialogue
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase) * 0.15 * dpr;
        p.y += p.vy;
        if (p.y < -10 || p.x < -10 || p.x > w + 10) Object.assign(p, spawn(false));
        const alpha = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(p.phase * 1.7));
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 226, 180, ${alpha.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
