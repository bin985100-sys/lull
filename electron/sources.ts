/**
 * Чтение списков треков из Spotify и SoundCloud по публичной ссылке.
 * Без зависимостей от Electron — тот же код проверяется скриптом `npm run test:import`.
 *
 * Что работает:
 *  - Spotify: публичные плейлисты и альбомы (через страницу встраивания).
 *  - SoundCloud: публичные плейлисты/альбомы целиком и отдельные треки.
 * Что не работает ни у кого без входа в аккаунт сервиса: личные «Любимые треки»,
 * закрытые плейлисты.
 */
export interface SourceTrack {
  title: string;
  artist: string;
  durationSec?: number;
}
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
export interface SourceList {
  name: string;
  items: SourceTrack[];
  /** Сколько треков в оригинале (если сервис отдал не все) */
  declared?: number;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function fetchPage(url: string, f: Fetch): Promise<string> {
  const r = await f(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,ru;q=0.8' } });
  if (!r.ok) throw new Error(`Страница недоступна (${r.status})`);
  return r.text();
}

// --- Spotify -------------------------------------------------------------------
export async function spotify(url: string, f: Fetch): Promise<SourceList> {
  const m = url.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error('Не похоже на ссылку Spotify');
  const html = await fetchPage(`https://open.spotify.com/embed/${m[1]}/${m[2]}`, f);
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)?.[1];
  if (!json) throw new Error('Spotify не отдал список треков — проверь, что плейлист открыт для всех');
  const entity = JSON.parse(json)?.props?.pageProps?.state?.data?.entity;
  const list: any[] = entity?.trackList ?? (entity?.title ? [{ title: entity.title, subtitle: entity.artists?.map((a: any) => a.name).join(', '), duration: entity.duration }] : []);
  return {
    name: entity?.name ?? entity?.title ?? 'Плейлист из Spotify',
    items: list.map((t) => ({ title: t.title, artist: (t.subtitle ?? '').split(',')[0].trim(), durationSec: t.duration ? Math.round(t.duration / 1000) : undefined })),
    declared: entity?.trackCount ?? entity?.totalTracks
  };
}

// --- SoundCloud -----------------------------------------------------------------
/** client_id публичного веб-клиента SoundCloud: ищем в его скриптах. */
async function scClientId(html: string, f: Fetch): Promise<string | null> {
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]).reverse();
  for (const src of scripts.slice(0, 6)) {
    const js = await fetchPage(src, f).catch(() => '');
    const id = js.match(/client_id\s*[:=]\s*"([A-Za-z0-9]{20,40})"/)?.[1];
    if (id) return id;
  }
  return null;
}

const scTrack = (t: any): SourceTrack => ({ title: t.title, artist: t.publisher_metadata?.artist ?? t.user?.username ?? '', durationSec: t.duration ? Math.round(t.duration / 1000) : undefined });

export async function soundcloud(url: string, f: Fetch): Promise<SourceList> {
  const html = await fetchPage(url, f);
  const json = html.match(/window\.__sc_hydration\s*=\s*(\[.+?\]);<\/script>/s)?.[1];
  if (!json) throw new Error('SoundCloud не отдал список треков');
  const hyd: any[] = JSON.parse(json);
  const pl = hyd.find((h) => h.hydratable === 'playlist')?.data;
  const tr = hyd.find((h) => h.hydratable === 'sound')?.data;
  if (!pl) return { name: tr?.title ?? 'Трек из SoundCloud', items: tr ? [scTrack(tr)] : [] };

  // На странице полные данные только у первых ~5 треков, у остальных — одни id.
  // Догружаем их через публичный API веб-клиента пачками по 50.
  const all: any[] = pl.tracks ?? [];
  const full = new Map<number, any>(all.filter((t) => t.title).map((t) => [t.id, t]));
  const missing = all.filter((t) => !t.title).map((t) => t.id);
  if (missing.length) {
    const cid = await scClientId(html, f);
    if (cid)
      for (let i = 0; i < missing.length; i += 50) {
        const ids = missing.slice(i, i + 50).join(',');
        const r = await f(`https://api-v2.soundcloud.com/tracks?ids=${ids}&client_id=${cid}`, { headers: { 'User-Agent': UA } }).catch(() => null);
        if (!r?.ok) break;
        for (const t of (await r.json()) as any[]) full.set(t.id, t);
      }
  }
  // Сохраняем исходный порядок
  const items = all.map((t) => full.get(t.id)).filter((t) => t?.title).map(scTrack);
  return { name: pl.title ?? 'Плейлист из SoundCloud', items, declared: pl.track_count ?? all.length };
}
