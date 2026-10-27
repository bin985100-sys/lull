import type { Card, HomeSection, Track } from '../../shared/types';
import { api } from '../api';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';

/**
 * Стартовая библиотека: при первом запуске пользователь сразу видит готовые плейлисты,
 * а не пустой экран. Собирается из чартов и ленты YouTube Music (работают без входа),
 * обложки и первые потоки прогреваются заранее — первый трек включается мгновенно.
 * После входа в аккаунт главная, «Волна» и медиатека становятся личными.
 */
const uniq = (list: Track[]) => {
  const seen = new Set<string>();
  return list.filter((t) => !seen.has(t.id) && (seen.add(t.id), true));
};
const tracksOf = (secs: HomeSection[]) => secs.filter((s) => s.layout === 'tracks').flatMap((s) => s.items.map((c) => c.track).filter(Boolean) as Track[]);

let running = false;

export async function seedStarterLibrary(): Promise<void> {
  const settings = useSettings.getState();
  if (settings.starterSeeded || running) return;
  running = true;
  try {
    const [charts, home] = await Promise.all([api.charts().catch(() => [] as HomeSection[]), api.home().catch(() => [] as HomeSection[])]);
    const hits = uniq(tracksOf(charts)).slice(0, 50);
    const fresh = uniq(tracksOf(home)).filter((t) => !hits.some((h) => h.id === t.id)).slice(0, 40);
    if (!hits.length && !fresh.length) return; // нет сети — попробуем при следующем запуске

    const lib = useLibrary.getState();
    // Только для пустой библиотеки: у вернувшегося пользователя ничего не трогаем
    if (!lib.playlists.length && !lib.saved.length) {
      if (fresh.length) lib.createPlaylist('Для старта', fresh);
      if (hits.length) {
        const p = lib.createPlaylist('Хиты недели', hits);
        lib.togglePin(p.id);
      }
      const albums: Card[] = [...charts, ...home].filter((s) => s.layout === 'cards').flatMap((s) => s.items).filter((c) => c.kind === 'album').slice(0, 4);
      for (const a of albums.reverse()) if (!lib.isSaved(a.id)) lib.toggleSaved(a);
    }
    useSettings.getState().set('starterSeeded', true);
    void warmUp([...hits.slice(0, 24), ...fresh.slice(0, 12)]);
  } finally {
    running = false;
  }
}

/** Прогрев: обложки в кеш картинок, первые потоки — заранее, чтобы старт был без ожидания. */
async function warmUp(list: Track[]) {
  for (const t of list) {
    if (!t.thumb) continue;
    const img = new Image();
    img.src = api.imageUrl(t.thumb);
  }
  await Promise.all(list.slice(0, 3).map((t) => api.prepareStream(t.id, true).catch(() => {})));
}
