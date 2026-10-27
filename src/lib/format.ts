import type { Track } from '../../shared/types';

export function formatTime(sec?: number): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function formatTotal(sec: number): string {
  const h = Math.floor(sec / 3600);
  if (h) return `${h} ч ${Math.round((sec % 3600) / 60)} мин`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} мин ${s} сек` : `${m} мин`;
}

/** Склонение: plural(5, ['трек','трека','треков']) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const tracksWord = (n: number) => `${n.toLocaleString('ru-RU')} ${plural(n, ['трек', 'трека', 'треков'])}`;

export const artistsText = (t: Track) => t.artists.map((a) => a.name).join(', ');

export function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  return `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} ГБ`;
}

export function relativeDate(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  if (d <= 0) return 'Сегодня';
  if (d === 1) return 'Вчера';
  if (d < 7) return `${d} ${plural(d, ['день', 'дня', 'дней'])} назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const uid = () => Math.random().toString(36).slice(2, 10);
