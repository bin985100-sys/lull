import { useLibrary } from '@/store/library';
import { audius, FOCUS_IMAGE, type Track } from './audius';
import { lull } from './lull';

/* Подборки приложения: чарты и рекомендации каталога Lull, микс из любимых исполнителей, находки Audius. */
export type Mix = { id: string; title: string; image?: any; load: (s: AbortSignal) => Promise<Track[]> };

const tracksOf = (secs: Awaited<ReturnType<typeof lull.home>>) => secs.flatMap((x) => x.items).filter((c) => c.track).map((c) => c.track!);

async function forYou(s: AbortSignal) {
  const favs = useLibrary.getState().favArtists.slice(0, 8);
  if (!favs.length) return tracksOf(await lull.home(undefined, s));
  const lists = await Promise.all(favs.map((a) => (a.source === 'audius' ? audius.artistTracks(a.id, s) : lull.artist(a.id, s).then((p) => p.top)).catch(() => [] as Track[])));
  const out: Track[] = [];
  for (let i = 0; i < 5; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export const MIXES: Record<string, Mix> = {
  foryou: { id: 'foryou', title: 'Для тебя', image: FOCUS_IMAGE, load: forYou },
  recommended: { id: 'recommended', title: 'Дальше по звучанию', load: async (s) => tracksOf(await lull.home(undefined, s)) },
  trending: { id: 'trending', title: 'В тренде', load: async (s) => tracksOf((await lull.charts(s)).filter((x) => x.layout === 'tracks')) },
  underground: { id: 'underground', title: 'Независимые артисты', load: (s) => audius.underground(s) },
};
