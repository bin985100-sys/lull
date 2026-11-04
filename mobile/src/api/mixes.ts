import { useLibrary } from '@/store/library';
import { audius, FOCUS_IMAGE, MOODS, type Track } from './audius';

/* Подборки приложения: жанровые чарты Audius и микс из любимых исполнителей. */
export type Mix = { id: string; title: string; image?: any; load: (s: AbortSignal) => Promise<Track[]> };

async function forYou(s: AbortSignal) {
  const favs = useLibrary.getState().favArtists.slice(0, 8);
  if (!favs.length) return audius.trending({ limit: 25 }, s);
  const lists = await Promise.all(favs.map((a) => audius.artistTracks(a.id, s).catch(() => [] as Track[])));
  const out: Track[] = [];
  for (let i = 0; i < 4; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export const MIXES: Record<string, Mix> = {
  foryou: { id: 'foryou', title: 'Для тебя', image: FOCUS_IMAGE, load: forYou },
  trending: { id: 'trending', title: 'В тренде недели', load: (s) => audius.trending({ limit: 40 }, s) },
  underground: { id: 'underground', title: 'Новые находки', load: (s) => audius.underground(s) },
  ...Object.fromEntries(MOODS.map((m) => [m.id, { id: m.id, title: m.title, image: m.image, load: (s: AbortSignal) => audius.trending({ genre: m.genre, limit: 30 }, s) }])),
};
