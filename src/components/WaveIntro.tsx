import { useEffect, useRef } from 'react';
import { playSfx, preloadSfx } from '../lib/sfx';

/**
 * Заставка «Волны» (~2.6 с), рисуется на canvas:
 *  0.00–0.50  обложки вылетают из центра и раскладываются вокруг (пружина, свечение)
 *  0.50–1.05  парят, лёгкий параллакс
 *  1.05–2.05  закручиваются спиралью к центру, ускоряясь, со шлейфами
 *  2.05–2.40  схлопываются во вспышку света
 *  2.30       → onButton: появляется белая кнопка Play (настоящая кнопка приложения)
 *  2.60       → onDone
 * На каждое движение — свой звук. Клик или Esc — пропустить.
 */
export const INTRO = { burst: 0, swirl: 1.05, impact: 2.05, button: 2.3, done: 2.6, stagger: 0.06 };

export interface Card {
  img: HTMLImageElement;
  /** Заранее размытая копия для свечения (дешевле, чем blur на каждом кадре) */
  glow?: HTMLCanvasElement;
  angle: number;
  dist: number;
  scale: number;
  tilt: number;
  phase: number;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeOutBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
const easeInCubic = (x: number) => x * x * x;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/** Один кадр заставки в момент t (секунды). Чистая функция — её же можно отрисовать покадрово. */
export function renderIntro(ctx: CanvasRenderingContext2D, cards: Card[], t: number, w: number, h: number) {
    const cx = w / 2;
    const cy = h / 2;
    const unit = Math.min(w, h);
    const base = unit * 0.25;

    const swirlU = clamp((t - INTRO.swirl) / (INTRO.impact - INTRO.swirl));
    ctx.clearRect(0, 0, w, h);

    // Положение карточки в момент времени tt
    const place = (c: Card, i: number, tt: number) => {
      const start = INTRO.burst + i * INTRO.stagger;
      const pIn = clamp((tt - start) / 0.42);
      const out = easeOutBack(pIn);
      const su = clamp((tt - INTRO.swirl) / (INTRO.impact - INTRO.swirl));
      const bob = Math.sin(tt * 3.2 + c.phase) * unit * 0.008;
      const sway = Math.cos(tt * 2.4 + c.phase) * 0.03;
      // Вихрь: угол растёт квадратично, радиус и размер уходят к нулю
      const spin = su > 0 ? Math.PI * 2 * 1.35 * su * su : 0;
      const shrink = 1 - easeInCubic(su);
      const ang = c.angle + spin + (tt - start) * 0.12;
      const dist = c.dist * unit * out * shrink;
      return {
        pIn,
        x: cx + Math.cos(ang) * dist * (w / unit > 1.3 ? 1.35 : 1),
        y: cy + Math.sin(ang) * dist + bob,
        size: base * c.scale * (0.25 + 0.75 * clamp(out)) * (0.12 + 0.88 * shrink),
        rot: c.tilt * (1 - su) + sway + spin * 0.35 + (1 - clamp(out)) * (i % 2 ? 0.5 : -0.5),
        alpha: clamp(pIn * 2.5) * (su > 0.85 ? clamp((1 - su) / 0.15 + 0.2) : 1)
      };
    };
    const draw = (c: Card, p: ReturnType<typeof place>, a: number, withGlow: boolean) => {
      const { x, y, size, rot } = p;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (withGlow && c.glow) {
        ctx.globalAlpha = a * 0.75;
        ctx.drawImage(c.glow, -size * 1.2, -size * 1.08, size * 2.4, size * 2.4);
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.1);
      ctx.clip();
      ctx.drawImage(c.img, -size / 2, -size / 2, size, size);
      if (withGlow) {
        const g = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.16)');
        g.addColorStop(0.5, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();
    };

    if (t <= INTRO.impact + 0.08)
      cards.forEach((c, i) => {
        const now0 = place(c, i, t);
        if (now0.pIn <= 0) return;
        // Шлейф в вихре: 3 полупрозрачные копии чуть «позади» по времени
        if (swirlU > 0.05)
          for (let k = 3; k >= 1; k--) {
            const ghost = place(c, i, t - k * 0.035 * (0.6 + swirlU));
            draw(c, ghost, now0.alpha * (0.22 - k * 0.05) * (0.5 + swirlU), false);
          }
        draw(c, now0, now0.alpha, true);
      });

    // Вспышка при схлопывании
    const f = (t - INTRO.impact) / 0.5;
    if (f > -0.15 && f < 1) {
      const k = f < 0 ? clamp((f + 0.15) / 0.15) : 1 - easeOutCubic(clamp(f));
      const R = unit * (0.08 + 0.55 * easeOutCubic(clamp(f + 0.15)));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
      g.addColorStop(0.35, `rgba(255,255,255,${0.45 * k})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

}

/** Подготовка обложек: загрузка и размытые копии для свечения. */
export async function prepareCards(covers: string[]): Promise<Card[]> {
  const n = covers.length;
  const cards: Card[] = covers.map((src, i) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    return {
      img,
      angle: -Math.PI / 2 + (i / n) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12),
      dist: 0.34 + (i % 3) * 0.05,
      scale: 0.85 + ((i * 37) % 30) / 100,
      tilt: ((i % 2 ? 1 : -1) * (5 + ((i * 13) % 7))) * (Math.PI / 180),
      phase: i * 1.7
    };
  });
  await Promise.all(cards.map((c) => c.img.decode().catch(() => {})));
  for (const c of cards) {
    if (!c.img.naturalWidth) continue;
    const g = document.createElement('canvas');
    // запас по краям, чтобы размытие не упиралось в границы и не давало «квадратный» ореол
    g.width = g.height = 240;
    const gx = g.getContext('2d')!;
    gx.filter = 'blur(20px) saturate(1.8) brightness(1.1)';
    gx.drawImage(c.img, 70, 70, 100, 100);
    c.glow = g;
  }
  return cards;
}

export function WaveIntro({ covers, onButton, onDone }: { covers: string[]; onButton: () => void; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onButton, onDone });
  cb.current = { onButton, onDone };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let raf = 0;
    let cancelled = false;
    let buttonFired = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (!buttonFired) cb.current.onButton();
      cb.current.onDone();
    };
    const skip = (e?: KeyboardEvent) => {
      if (e && e.key !== 'Escape' && e.key !== ' ' && e.key !== 'Enter') return;
      finish();
    };
    window.addEventListener('keydown', skip);
    canvas.addEventListener('pointerdown', () => finish());

    let cards: Card[] = [];
    void Promise.all([preloadSfx(), prepareCards(covers).then((c) => (cards = c))]).then(() => {
      if (cancelled) return;
      // Звуки по таймлайну
      cards.forEach((_, i) => i % 2 === 0 && playSfx('swish', { delay: INTRO.burst + i * INTRO.stagger, volume: 0.45, rate: 0.9 + i * 0.05 }));
      playSfx('swirl', { delay: INTRO.swirl, volume: 0.55 });
      playSfx('impact', { delay: INTRO.impact, volume: 0.8 });
      playSfx('pop', { delay: INTRO.button, volume: 0.6 });
      const t0 = performance.now();
      (window as unknown as { __introStart?: number }).__introStart = Date.now();

      const frame = (now: number) => {
        if (cancelled || finished) return;
        const t = (now - t0) / 1000;
        renderIntro(ctx, cards, t, w, h);

        if (!buttonFired && t >= INTRO.button) {
          buttonFired = true;
          cb.current.onButton();
        }
        if (t >= INTRO.done) return finish();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="wave-intro" aria-label="Заставка волны. Нажми, чтобы пропустить" />;
}
