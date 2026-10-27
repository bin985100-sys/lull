import { api } from '../api';
import type { Track } from '../../shared/types';

/**
 * Заранее получаем ссылку на звук — к моменту клика трек стартует сразу.
 * Наведение (~0,3 с) почти всегда перед кликом; открытый список — первые треки.
 * В основном процессе такие запросы собираются в пачку и получаются одним запуском yt-dlp.
 */
const done = new Map<string, number>();
const seen = (id: string) => (done.get(id) ?? 0) > Date.now() - 3 * 60_000;
let timer: ReturnType<typeof setTimeout> | undefined;

function prep(track: Track | string) {
  const id = typeof track === 'string' ? track : track.id;
  if (!id || seen(id) || id.startsWith('local:')) return;
  done.set(id, Date.now());
  if (done.size > 500) done.delete(done.keys().next().value!);
  const hint = typeof track === 'string' ? undefined : { title: track.title, artist: track.artists[0]?.name ?? '', duration: track.durationSec };
  void api.prepareStream(id, true, hint).catch(() => done.delete(id));
}

export function hoverPrefetch(track: Track | string) {
  clearTimeout(timer);
  const id = typeof track === 'string' ? track : track.id;
  if (seen(id)) return;
  timer = setTimeout(() => prep(track), 250);
}

export function cancelHoverPrefetch() {
  clearTimeout(timer);
}

/** Открыли список — через секунду готовим первые несколько треков (одной пачкой). */
export function listPrefetch(tracks: (Track | string)[], count = 3) {
  const pick = tracks.filter((track) => !seen(typeof track === 'string' ? track : track.id)).slice(0, count);
  if (!pick.length) return () => {};
  const t = setTimeout(() => pick.forEach(prep), 600);
  return () => clearTimeout(t);
}
