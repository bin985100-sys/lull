import { forYou } from '@/reco/engine';
import { audius, FOCUS_IMAGE, type Track } from './audius';
import { lull } from './lull';

/* Подборки приложения: чарты и рекомендации каталога Lull, микс из любимых исполнителей, находки Audius. */
export type Mix = { id: string; title: string; image?: any; load: (s: AbortSignal) => Promise<Track[]> };

const tracksOf = (secs: Awaited<ReturnType<typeof lull.home>>) => secs.flatMap((x) => x.items).filter((c) => c.track).map((c) => c.track!);

export const MIXES: Record<string, Mix> = {
  foryou: { id: 'foryou', title: 'Для тебя', image: FOCUS_IMAGE, load: forYou },
  recommended: { id: 'recommended', title: 'Дальше по звучанию', load: async (s) => tracksOf(await lull.home(undefined, s)) },
  trending: { id: 'trending', title: 'В тренде', load: async (s) => tracksOf((await lull.charts(s)).filter((x) => x.layout === 'tracks')) },
  underground: { id: 'underground', title: 'Независимые артисты', load: (s) => audius.underground(s) },
};
