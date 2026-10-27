import { api } from '../api';

export const MONO_PALETTE = ['#77777f', '#3b3b42', '#a3a3ab', '#26262c'];
export const DEFAULT_PALETTE = ['#5B3FD1', '#2A5BD7', '#B0407A', '#1F8A70'];
const cache = new Map<string, string[]>();
const pending = new Map<string, Promise<string[]>>();

type HSL = [number, number, number];

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToHex([h, s, l]: HSL): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * Палитра из 4 цветов обложки: пиксели раскладываются по 12 корзинам оттенков с весом
 * по насыщенности, берутся самые «весомые» корзины. Цвета подтягиваются по яркости,
 * чтобы фон не был грязным или кислотным. Для серых обложек — мягкие тона одного оттенка.
 */
export function coverPalette(src?: string): Promise<string[]> {
  if (!src) return Promise.resolve(DEFAULT_PALETTE);
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const task = new Promise<string[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        const buckets = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
        let grayL = 0, grayN = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          if (s < 0.15 || l < 0.08 || l > 0.94) {
            grayL += l;
            grayN++;
            continue;
          }
          const w = s * s * (1 - Math.abs(l - 0.5));
          const b = buckets[Math.floor(h / 30) % 12];
          b.w += w; b.h += h * w; b.s += s * w; b.l += l * w;
        }
        const top = buckets.filter((b) => b.w > 0.4).sort((a, b) => b.w - a.w).slice(0, 4);
        let colors: HSL[] = top.map((b) => [b.h / b.w, Math.min(0.82, Math.max(0.45, (b.s / b.w) * 1.1)), Math.min(0.46, Math.max(0.3, b.l / b.w))]);
        if (colors.length === 0) {
          // Чёрно-белая обложка: приглушённые холодные тона
          const l = Math.min(0.4, Math.max(0.26, grayN ? grayL / grayN : 0.34));
          colors = [[230, 0.12, l], [250, 0.1, l * 0.8]];
        }
        // Добиваем до 4 цветов соседними оттенками
        const base = colors[0];
        while (colors.length < 4) {
          const k = colors.length;
          colors.push([(base[0] + (k % 2 ? 28 : -24) * k + 360) % 360, base[1] * 0.9, Math.max(0.3, base[2] - 0.06 * k)]);
        }
        const out = colors.map(hslToHex);
        cache.set(src, out);
        resolve(out);
      } catch {
        resolve(DEFAULT_PALETTE);
      }
    };
    img.onerror = () => resolve(DEFAULT_PALETTE);
    img.src = api.imageUrl(src);
  }).finally(() => pending.delete(src));
  pending.set(src, task);
  return task;
}
