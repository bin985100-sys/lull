import { useEffect, useRef, type RefObject } from 'react';
import { audioEngine } from '../store/player';

/**
 * Поле «Волны» на весь экран: за обложкой мягко переливаются её цвета.
 * Центр плавно следует за обложкой (когда открыт текст, обложка уезжает влево).
 * Пока играет, сияние чуть ярче; на паузе — спокойнее.
 */
export function WaveField({ colors, playing, anchor }: { colors: string[]; playing: boolean; /** Элемент, от которого идут волны (обложка) */ anchor: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ colors: colors.map(hexToRgb), target: colors.map(hexToRgb), playing, center: { x: -1, y: -1 }, goal: { x: 0.5, y: 0.45 }, radius: 150, goalR: 150 });
  st.current.target = colors.map(hexToRgb);
  st.current.playing = playing;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let t = 0;
    let last = performance.now();
    let amp = 0.3;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = st.current;
      // центр — середина обложки (читаем каждый кадр: она двигается вместе с раскладкой)
      const el = anchor.current;
      if (el && w && h) {
        const a = el.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        s.goal = { x: (a.left + a.width / 2 - c.left) / w, y: (a.top + a.height / 2 - c.top) / h };
        s.goalR = a.width / 2;
      }
      if (s.center.x < 0) (s.center = { ...s.goal }), (s.radius = s.goalR);
      const ease = 1 - Math.exp(-dt * 6);
      s.center.x += (s.goal.x - s.center.x) * ease;
      s.center.y += (s.goal.y - s.center.y) * ease;
      s.radius += (s.goalR - s.radius) * ease;
      for (let i = 0; i < 4; i++) {
        const c = s.colors[i] ?? s.target[i] ?? [120, 120, 140];
        const g = s.target[i] ?? c;
        s.colors[i] = [c[0] + (g[0] - c[0]) * dt * 1.2, c[1] + (g[1] - c[1]) * dt * 1.2, c[2] + (g[2] - c[2]) * dt * 1.2];
      }
      const energy = s.playing ? audioEngine.getEnergy() : 0;
      amp += ((s.playing ? 0.6 + energy * 0.6 : 0.3) - amp) * dt * 1.5;
      t += dt * (reduce ? 0.1 : 1);

      const cx = s.center.x * w;
      const cy = s.center.y * h;
      const R = s.radius;
      ctx.clearRect(0, 0, w, h);

      // 1. Цветное сияние за обложкой
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) {
        const col = s.colors[k];
        const a = t * 0.18 * (k % 2 ? -1 : 1) + k * 1.7;
        const ox = Math.cos(a) * R * 0.45;
        const oy = Math.sin(a * 1.2) * R * 0.35;
        const rr = R * (1.55 + 0.12 * Math.sin(t * 0.4 + k));
        const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
        g.addColorStop(0, `rgba(${col.map(Math.round).join(',')},${0.32 * (0.8 + amp * 0.4)})`);
        g.addColorStop(1, `rgba(${col.map(Math.round).join(',')},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx + ox - rr, cy + oy - rr, rr * 2, rr * 2);
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="wave-field" aria-hidden="true" />;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
