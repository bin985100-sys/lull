import { api } from '../api';

const cache = new Map<string, string>();
export const DEFAULT_TINT = '#5B3FD1';

/**
 * Доминирующий «живой» цвет обложки: уменьшаем картинку до 24×24,
 * берём пиксели с высокой насыщенностью и усредняем с весом по насыщенности.
 */
export function coverColor(src?: string): Promise<string> {
  if (!src) return Promise.resolve(DEFAULT_TINT);
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [pr, pg, pb] = [d[i], d[i + 1], d[i + 2]];
          const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = max / 255;
          const weight = 0.05 + sat * sat * (lum > 0.15 && lum < 0.95 ? 1 : 0.2);
          r += pr * weight; g += pg * weight; b += pb * weight; w += weight;
        }
        const hex = tune(r / w, g / w, b / w);
        cache.set(src, hex);
        resolve(hex);
      } catch {
        resolve(DEFAULT_TINT);
      }
    };
    img.onerror = () => resolve(DEFAULT_TINT);
    img.src = api.imageUrl(src);
  });
}

/** Подтягиваем насыщенность и яркость, чтобы свечение не было серым или кислотным. */
function tune(r: number, g: number, b: number): string {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  s = Math.min(0.75, Math.max(0.35, s * 1.25));
  const L = Math.min(0.55, Math.max(0.38, l));
  const C = (1 - Math.abs(2 * L - 1)) * s;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - C / 2;
  const [R, G, B] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return '#' + [R, G, B].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
