import { api } from '../api';

/**
 * Заранее получаем ссылку на звук — к моменту клика трек стартует сразу.
 * Наведение (~0,3 с) почти всегда перед кликом; открытый список — первые треки.
 * В основном процессе такие запросы собираются в пачку и получаются одним запуском yt-dlp.
 */
const done = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

function prep(id: string) {
  if (!id || done.has(id) || id.startsWith('local:')) return;
  done.add(id);
  void api.prepareStream(id, true).catch(() => done.delete(id));
}

export function hoverPrefetch(id: string) {
  clearTimeout(timer);
  if (done.has(id)) return;
  timer = setTimeout(() => prep(id), 300);
}

export function cancelHoverPrefetch() {
  clearTimeout(timer);
}

/** Открыли список — через секунду готовим первые несколько треков (одной пачкой). */
export function listPrefetch(ids: string[], count = 4) {
  const pick = ids.filter((i) => !done.has(i)).slice(0, count);
  if (!pick.length) return () => {};
  const t = setTimeout(() => pick.forEach(prep), 1200);
  return () => clearTimeout(t);
}
