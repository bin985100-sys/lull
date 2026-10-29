import { app } from 'electron';
import { stopOthers, ytdlpResolve, type DlpStream } from './ytdlp';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Innertube, Log, Platform, UniversalCache, YTNodes } from 'youtubei.js';
import type { Types } from 'youtubei.js';
export type OAuth2Tokens = NonNullable<Parameters<Innertube['session']['signIn']>[0]>;
import type {
  SearchSuggest,
  ArtistPage,
  ArtistRef,
  Card,
  Collection,
  HomeSection,
  SearchFilter,
  SearchResults,
  StreamMeta,
  Track
} from '../shared/types';
import { mainSettings, storeGet, storeSet } from './store';
import { relayApi, relayOn, xfetch, markRelayDown } from './relay';
import { installParserDiagnostics } from './yt-parser';
import { selectStream, isVideoUnavailable } from './stream-selection';

Log.setLevel(Log.Level.ERROR);
installParserDiagnostics();

// --- Интерпретатор JS для расшифровки ссылок (n/sig) ----------------------
// Скрипт плеера YouTube выполняется в изолированном контексте vm с таймаутом.
Platform.load({
  ...Platform.shim,
  eval: (data: Types.BuildScriptResult) => {
    const ctx = vm.createContext({ URL, URLSearchParams, TextEncoder, TextDecoder, encodeURIComponent, decodeURIComponent });
    return vm.runInContext(`(function(){\n${data.output}\n})()`, ctx, { timeout: 5000 });
  }
});

// --- Сессия -------------------------------------------------------------------
let client: Innertube | null = null;
let creating: Promise<Innertube> | null = null;
let poToken: string | undefined;
let visitor: string | undefined;
let authCookie: string | undefined;
let onBehalfOf: string | undefined;
/** Вход по QR-коду (OAuth устройства, как у YouTube на телевизоре) */
let oauthTokens: OAuth2Tokens | undefined;
let remoteSession = false;
/** Запросы с входом в аккаунт стабильно получают 400 — временно работаем анонимно */
let authBroken = false;
export const isAuthBroken = () => authBroken;
let onTokensUpdate: ((t: OAuth2Tokens) => void) | undefined;

// Все запросы каталога идут через xfetch: при включённом сервере Lull — через него
const electronFetch: typeof fetch = (input, init) => xfetch(input as any, init as any);

async function create(): Promise<Innertube> {
  const yt = await Innertube.create({
    cache: new UniversalCache(true, path.join(app.getPath('userData'), 'yt-cache')),
    // Сессию не берём из кеша на диске: устаревшая сессия даёт 400 «invalid argument» на всё
    enable_session_cache: false,
    lang: mainSettings().lang ?? 'ru',
    // После ошибки 400 берём настоящие данные сессии с YouTube, а не сгенерированные локально
    generate_session_locally: !remoteSession,
    fetch: electronFetch,
    po_token: poToken,
    visitor_data: visitor,
    // Если YouTube отклоняет запросы с входом в аккаунт — работаем без него (каталог и звук доступны и так)
    cookie: authBroken ? undefined : authCookie,
    on_behalf_of_user: authBroken ? undefined : onBehalfOf
  } as any);
  visitor = yt.session.context.client.visitorData;
  if (oauthTokens && !authCookie && !authBroken) {
    yt.session.on('update-credentials', ({ credentials }) => credentials && onTokensUpdate?.(credentials));
    await yt.session.signIn(oauthTokens);
  }
  return yt;
}

/** Подключить аккаунт, полученный входом по QR-коду. */
export async function setOAuth(tokens: OAuth2Tokens | undefined, onUpdate?: (t: OAuth2Tokens) => void) {
  authBroken = false;
  oauthTokens = tokens;
  onTokensUpdate = onUpdate;
  if (tokens) authCookie = undefined;
  client = null;
  streams.clear();
  memo.clear();
  await yt();
}

/**
 * Вход по QR-коду: Google выдаёт короткий код устройства, пользователь открывает
 * ссылку на телефоне (сканирует QR) и подтверждает вход. Пока ждём — опрашиваем Google.
 * Возвращает функцию отмены; результат приходит в onDone.
 */
export function deviceSignIn(
  onPending: (p: { userCode: string; verificationUrl: string; expiresIn: number }) => void,
  onDone: (tokens: OAuth2Tokens | null, error?: string) => void
): () => void {
  let cancelled = false;
  void (async () => {
    try {
      const tmp = await Innertube.create({ generate_session_locally: true, fetch: electronFetch, lang: mainSettings().lang ?? 'ru' } as any);
      tmp.session.on('auth-pending', (d) => !cancelled && onPending({ userCode: d.user_code, verificationUrl: d.verification_url, expiresIn: d.expires_in }));
      tmp.session.on('auth', ({ credentials }) => !cancelled && onDone(credentials ?? null));
      tmp.session.on('auth-error', (e) => !cancelled && onDone(null, e.message));
      await tmp.session.signIn();
    } catch (e) {
      if (!cancelled) onDone(null, (e as Error).message);
    }
  })();
  return () => {
    cancelled = true;
  };
}

export async function yt(): Promise<Innertube> {
  if (client) return client;
  if (!creating) {
    creating = create()
      .then((c) => (client = c))
      .finally(() => (creating = null));
  }
  return creating;
}

/** Подключить аккаунт (cookies YouTube) и, при желании, brand-канал. Сессия пересоздаётся. */
export async function setAuth(cookie: string | undefined, pageId?: string) {
  authBroken = false;
  authCookie = cookie;
  oauthTokens = undefined;
  onBehalfOf = pageId;
  client = null;
  streams.clear();
  memo.clear();
  await yt();
}

/** Сменить канал (brand-аккаунт), не трогая способ входа. */
export async function setOnBehalfOf(pageId: string | undefined) {
  onBehalfOf = pageId;
  client = null;
  streams.clear();
  memo.clear();
  await yt();
}

export const isSignedIn = () => !!authCookie || !!oauthTokens;

export async function getVisitorData(): Promise<string> {
  await yt();
  return visitor ?? '';
}

/** Новый PO-токен от рендерера: пересоздаём сессию, сбрасываем кеш ссылок. */
export async function setPoToken(token: string, visitorData: string) {
  poToken = token;
  visitor = visitorData || visitor;
  client = null;
  streams.clear();
  await yt();
}

// --- Утилиты разбора -----------------------------------------------------------
type Thumb = { url: string; width?: number; height?: number };

export function bestThumb(list?: Thumb[] | null, size = 544): string | undefined {
  if (!list || list.length === 0) return undefined;
  const sorted = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  let url = sorted[0].url;
  if (url.startsWith('//')) url = `https:${url}`;
  // У lh3.googleusercontent можно запросить нужный размер прямо в ссылке
  if (/googleusercontent\.com|ggpht\.com/.test(url)) url = url.replace(/=w\d+-h\d+.*$/, `=w${size}-h${size}-l90-rj`);
  return url;
}

const txt = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const s = (v as { toString(): string }).toString();
  return s === '[object Object]' ? '' : s;
};

/** YouTube иногда отдаёт одиночный объект вместо массива — приводим к массиву. */
const arr = <T = any>(v: unknown): T[] => (Array.isArray(v) ? v : v == null ? [] : [v as T]);

const artistsOf = (list?: { name: string; channel_id?: string }[] | null): ArtistRef[] =>
  arr<{ name: string; channel_id?: string }>(list).filter((a) => a?.name).map((a) => ({ id: a.channel_id, name: txt(a.name) }));

const thumbsOfNode = (node: any): Thumb[] | undefined => {
  if (!node) return undefined;
  if (Array.isArray(node)) return node;
  if (Array.isArray(node.contents)) return node.contents;
  if (node.thumbnail) return thumbsOfNode(node.thumbnail);
  return undefined;
};

function isExplicit(item: any): boolean {
  return arr(item?.badges).some((b: any) => /explicit/i.test(String(b?.icon_type ?? b?.label ?? '')));
}

/** Одна «кривая» карточка не должна ронять всю страницу. */
function safeCard(node: any): Card | null {
  try {
    const c = cardFromAny(node);
    // Запоминаем «название — исполнитель» каждого трека: если ролик окажется недоступен, найдём замену
    if (c?.kind === 'track' && c.track) rememberHint(c.track.id, { title: c.track.title, artist: c.track.artists?.[0]?.name ?? '', duration: c.track.durationSec });
    return c;
  } catch (e) {
    console.warn('[yt] пропущена карточка:', (e as Error).message);
    return null;
  }
}

const stripVL = (id: string) => (id.startsWith('VL') ? id.slice(2) : id);

function trackFromResponsive(item: YTNodes.MusicResponsiveListItem, fallbackThumb?: string, album?: { id?: string; name: string }): Track | null {
  try {
    return trackFromResponsiveRaw(item, fallbackThumb, album);
  } catch (e) {
    console.warn('[yt] пропущен трек:', (e as Error).message);
    return null;
  }
}

function trackFromResponsiveRaw(item: YTNodes.MusicResponsiveListItem, fallbackThumb?: string, album?: { id?: string; name: string }): Track | null {
  if (!item?.id) return null;
  return {
    id: item.id,
    title: item.title ?? txt(item.flex_columns?.[0]?.title),
    artists: artistsOf(item.artists ?? item.authors),
    album: item.album ? { id: item.album.id, name: item.album.name } : album,
    durationSec: item.duration?.seconds || undefined,
    thumb: bestThumb(item.thumbnails, 544) ?? fallbackThumb,
    explicit: isExplicit(item)
  };
}


function cardFromResponsive(item: YTNodes.MusicResponsiveListItem): Card | null {
  const thumb = bestThumb(item.thumbnails);
  switch (item.item_type) {
    case 'song':
    case 'video': {
      const t = trackFromResponsive(item);
      return t ? { kind: 'track', id: t.id, title: t.title, subtitle: t.artists.map((a) => a.name).join(', '), thumb: t.thumb, track: t } : null;
    }
    case 'album':
      return item.id
        ? { kind: 'album', id: item.id, title: item.title ?? '', subtitle: [item.author?.name ?? artistsOf(item.artists).map((a) => a.name).join(', '), item.year].filter(Boolean).join(' · '), thumb, explicit: isExplicit(item) }
        : null;
    case 'playlist':
      return item.id ? { kind: 'playlist', id: stripVL(item.id), title: item.title ?? '', subtitle: [item.author?.name, item.item_count].filter(Boolean).join(' · '), thumb } : null;
    case 'artist':
    case 'library_artist':
      return item.id ? { kind: 'artist', id: item.id, title: item.name ?? item.title ?? '', subtitle: item.subscribers ?? 'Исполнитель', thumb, verified: isVerified(item.id) } : null;
    default:
      return null;
  }
}

function cardFromTwoRow(item: YTNodes.MusicTwoRowItem): Card | null {
  if (!item.id) return null;
  const title = txt(item.title);
  const subtitle = txt(item.subtitle);
  const thumb = bestThumb(item.thumbnail);
  switch (item.item_type) {
    case 'song':
    case 'video': {
      const track: Track = { id: item.id, title, artists: artistsOf(item.artists ?? (item.author ? [item.author] : [])), thumb };
      if (track.artists.length === 0 && subtitle) track.artists = [{ name: subtitle.split(' • ')[0] }];
      return { kind: 'track', id: item.id, title, subtitle, thumb, track };
    }
    case 'album':
      return { kind: 'album', id: item.id, title, subtitle, thumb, explicit: isExplicit(item) };
    case 'playlist':
      return { kind: 'playlist', id: stripVL(item.id), title, subtitle, thumb };
    case 'artist':
      return { kind: 'artist', id: item.id, title, subtitle: item.subscribers ?? subtitle, thumb, verified: isVerified(item.id) };
    default:
      return null;
  }
}

function cardFromAny(node: any): Card | null {
  if (node?.is?.(YTNodes.MusicTwoRowItem)) return cardFromTwoRow(node);
  if (node?.is?.(YTNodes.MusicResponsiveListItem)) return cardFromResponsive(node);
  if (node?.is?.(YTNodes.MusicMultiRowListItem)) {
    const id = node.endpoint?.payload?.videoId;
    return id ? { kind: 'track', id, title: txt(node.title), subtitle: txt(node.subtitle), thumb: bestThumb(thumbsOfNode(node.thumbnail)), track: { id, title: txt(node.title), artists: [{ name: txt(node.subtitle) }], thumb: bestThumb(thumbsOfNode(node.thumbnail)) } } : null;
  }
  return null;
}

function sectionFromShelf(shelf: any): HomeSection | null {
  const items = arr(shelf.contents).map(safeCard).filter(Boolean) as Card[];
  if (items.length === 0) return null;
  const header = shelf.header;
  const title = txt(header?.title) || txt(shelf.title);
  const onlyTracks = items.every((c) => c.kind === 'track');
  const responsive = arr(shelf.contents).some((n: any) => n?.is?.(YTNodes.MusicResponsiveListItem));
  return {
    title,
    subtitle: txt(header?.strapline) || undefined,
    layout: onlyTracks && responsive ? 'tracks' : 'cards',
    items
  };
}

// --- Кеш запросов: одинаковые запросы склеиваются, результат живёт несколько минут ---
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
const isBadRequest = (e: unknown) => /status code 400|INVALID_ARGUMENT|invalid argument/i.test(String((e as Error)?.message ?? e) + JSON.stringify((e as { info?: unknown })?.info ?? ''));

/**
 * YouTube отвечает 400 «Request contains an invalid argument», когда сессия испортилась
 * (протухли visitor data или PO-токен). Тогда собираем сессию заново — без токена, он
 * подтянется снова из рендерера.
 */
let sessionGen = 0;
let resetting: Promise<void> | null = null;

/** Пересоздать сессию. Первый раз — с настоящими данными YouTube, второй — ещё и без аккаунта. */
export async function resetSession(reason: string) {
  if (resetting) return resetting;
  resetting = (async () => {
    if (remoteSession && (authCookie || oauthTokens || onBehalfOf) && !authBroken) {
      authBroken = true;
      console.warn('[yt] YouTube Music отклоняет запросы с этим входом — продолжаю без аккаунта. Войди заново через окно Google.');
    }
    console.warn(`[yt] пересоздаю сессию: ${reason}`);
    poToken = undefined;
    visitor = undefined;
    remoteSession = true;
    client = null;
    streams.clear();
    memo.clear();
    sessionGen++;
    await yt();
  })().finally(() => (resetting = null));
  return resetting;
}

/** Выполнить запрос; при 400 — пересоздать сессию (с нарастанием) и повторить, до двух раз. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const gen = sessionGen;
    try {
      return await fn();
    } catch (e) {
      if (!isBadRequest(e) || attempt >= 2) throw e;
      // Если сессию уже пересоздал другой запрос — просто повторяем
      if (gen === sessionGen) await resetSession((e as Error).message);
      else await resetting;
    }
  }
}

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = withRetry(fn).catch((e) => {
    memo.delete(key);
    throw e;
  });
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 300) memo.delete(memo.keys().next().value as string);
  return value;
}

// --- Каталог ---------------------------------------------------------------------
export function home(chip?: string): Promise<HomeSection[]> {
  return cached(chip ? `home:${chip}` : 'home', 5 * 60_000, () => homeRaw(chip));
}

/** Категории главной YouTube Music: «Энергичная», «Для тренировок», «Расслабление»… */
export function homeChips(): Promise<string[]> {
  return cached('homeChips', 30 * 60_000, async () => {
    const c = await yt();
    const feed = await c.music.getHomeFeed();
    return feed.filters ?? [];
  });
}

async function homeRaw(chip?: string): Promise<HomeSection[]> {
  const c = await yt();
  let feed = await c.music.getHomeFeed();
  if (chip) feed = await feed.applyFilter(chip);
  const sections: HomeSection[] = [];
  const push = () => {
    for (const s of feed.sections ?? []) {
      if (!s.is(YTNodes.MusicCarouselShelf)) continue;
      const sec = sectionFromShelf(s);
      if (sec) sections.push(sec);
    }
  };
  push();
  // Подгружаем ещё пару страниц ленты, чтобы главная не была короткой
  for (let i = 0; i < 2 && feed.has_continuation; i++) {
    try {
      feed = await feed.getContinuation();
      push();
    } catch {
      break;
    }
  }
  return sections;
}

/**
 * «Сейчас популярно»: раздел «Навигатор» YouTube Music. Берём полки с треками
 * (чарты, тренды) первыми, альбомы и клипы — следом.
 */
export function charts(): Promise<HomeSection[]> {
  return cached('charts', 10 * 60_000, () => chartsRaw());
}
async function chartsRaw(): Promise<HomeSection[]> {
  const c = await yt();
  const ex: any = await c.music.getExplore();
  const out: HomeSection[] = [];
  for (const s of ex.sections ?? []) {
    if (!s?.is?.(YTNodes.MusicCarouselShelf)) continue;
    const sec = sectionFromShelf(s);
    if (sec) out.push(sec);
  }
  return out.sort((a, b) => Number(b.layout === 'tracks') - Number(a.layout === 'tracks'));
}

const filterMap: Record<SearchFilter, Types.MusicSearchType> = {
  all: 'all',
  songs: 'song',
  albums: 'album',
  artists: 'artist',
  playlists: 'playlist'
};

export function search(query: string, filter: SearchFilter = 'all'): Promise<SearchResults> {
  return cached(`search:${filter}:${query}`, 3 * 60_000, () => searchRaw(query, filter));
}
async function searchRaw(query: string, filter: SearchFilter): Promise<SearchResults> {
  const c = await yt();
  const res = await c.music.search(query, filter === 'all' ? undefined : { type: filterMap[filter] });
  const out: SearchResults = { query, tracks: [], albums: [], artists: [], playlists: [] };

  const take = (n: any) => {
    const card = safeCard(n);
    if (!card) return;
    if (card.kind === 'track' && card.track) out.tracks.push(card.track);
    else if (card.kind === 'album') out.albums.push(card);
    else if (card.kind === 'artist') out.artists.push(card);
    else if (card.kind === 'playlist') out.playlists.push(card);
  };
  // Выдача бывает и плоской (полки), и завёрнутой в ItemSection — обходим оба вида
  const walk = (node: any, depth = 0) => {
    if (!node || depth > 3) return;
    if (node.is?.(YTNodes.MusicCardShelf)) {
      out.top ??= topFromCardShelf(node);
      for (const n of arr(node.contents)) {
        const card = safeCard(n);
        if (card?.kind === 'track' && card.track) out.tracks.push(card.track);
      }
      return;
    }
    if (node.is?.(YTNodes.MusicShelf)) {
      for (const n of arr(node.contents)) take(n);
      return;
    }
    if (node.is?.(YTNodes.MusicResponsiveListItem)) return take(node);
    for (const n of arr(node.contents)) walk(n, depth + 1);
  };
  for (const shelf of arr(res.contents)) walk(shelf);
  const seen = new Set<string>();
  out.tracks = out.tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  // Вкладка «Всё» иногда приходит без привычных полок (исправление опечатки, новый вид выдачи) —
  // тогда ищем отдельно треки и альбомы, чтобы не показывать «ничего не нашлось»
  if (filter === 'all' && !out.tracks.length && !out.albums.length && !out.artists.length && !out.playlists.length) {
    console.warn(`[search] «${query}»: пустая вкладка «Всё» (${arr(res.contents).map((x: any) => x?.type).join(', ') || 'нет полок'}) — ищу по типам`);
    const [songs, albums] = await Promise.all([searchRaw(query, 'songs').catch(() => null), searchRaw(query, 'albums').catch(() => null)]);
    out.tracks = songs?.tracks ?? [];
    out.albums = albums?.albums ?? [];
  }
  if (!out.top) {
    const first = out.artists[0] ?? out.albums[0];
    if (first) out.top = first;
  }
  return out;
}

function topFromCardShelf(shelf: any): Card | undefined {
  const ep = shelf.on_tap ?? shelf.title?.endpoint ?? shelf.title?.runs?.[0]?.endpoint;
  const payload = ep?.payload ?? {};
  const title = txt(shelf.title);
  const subtitle = txt(shelf.subtitle);
  const thumb = bestThumb(thumbsOfNode(shelf.thumbnail));
  if (payload.videoId) {
    const track: Track = { id: payload.videoId, title, artists: [{ name: subtitle.split(' • ').slice(1, 2)[0] ?? subtitle }], thumb };
    return { kind: 'track', id: payload.videoId, title, subtitle, thumb, track };
  }
  const browseId: string | undefined = payload.browseId;
  if (!browseId) return undefined;
  const pageType: string = payload.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? '';
  const kind = /ARTIST/.test(pageType) || browseId.startsWith('UC') ? 'artist' : /ALBUM/.test(pageType) || browseId.startsWith('MPRE') ? 'album' : 'playlist';
  return { kind, id: kind === 'playlist' ? stripVL(browseId) : browseId, title, subtitle, thumb };
}

export function suggest(query: string): Promise<string[]> {
  return withRetry(() => suggestRaw(query));
}
async function suggestRaw(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const c = await yt();
  const sections = await c.music.getSearchSuggestions(query);
  const out: string[] = [];
  for (const s of sections) {
    for (const n of (s as any).contents ?? []) {
      const q = txt(n.suggestion) || n.endpoint?.payload?.query;
      if (q && !out.includes(q)) out.push(q);
    }
  }
  return out.slice(0, 8);
}

/** Подсказки с первой буквы: готовые запросы + сразу исполнители, треки и альбомы. */
export function suggestRich(query: string): Promise<SearchSuggest> {
  return withRetry(() => suggestRichRaw(query));
}
async function suggestRichRaw(query: string): Promise<SearchSuggest> {
  const out: SearchSuggest = { query, queries: [], items: [] };
  if (!query.trim()) return out;
  const c = await yt();
  const sections = await c.music.getSearchSuggestions(query);
  for (const s of sections) {
    for (const n of arr((s as any).contents)) {
      const q = txt(n.suggestion) || n.endpoint?.payload?.query;
      if (q) {
        if (!out.queries.includes(q)) out.queries.push(q);
        continue;
      }
      const card = safeCard(n);
      if (card && !out.items.some((i) => i.id === card.id)) out.items.push(card);
    }
  }
  out.queries = out.queries.slice(0, 6);
  out.items = out.items.slice(0, 6);
  return out;
}

function headerInfo(header: any) {
  return {
    title: txt(header?.title),
    subtitle: txt(header?.subtitle),
    second: txt(header?.second_subtitle),
    author: txt(header?.strapline_text_one) || txt(header?.author?.name),
    description: txt(header?.description?.description ?? header?.description),
    thumb: bestThumb(thumbsOfNode(header?.thumbnail), 720)
  };
}

export function album(id: string): Promise<Collection> {
  return cached(`album:${id}`, 10 * 60_000, () => albumRaw(id));
}
async function albumRaw(id: string): Promise<Collection> {
  const c = await yt();
  const a = await c.music.getAlbum(id);
  const h = headerInfo(a.header);
  const albumRef = { id, name: h.title };
  const year = h.subtitle.match(/\b(19|20)\d{2}\b/)?.[0];
  const tracks = a.contents.map((i) => trackFromResponsive(i, h.thumb, albumRef)).filter(Boolean) as Track[];
  // На странице альбома у треков нет исполнителей — подставляем из шапки
  for (const t of tracks) if (t.artists.length === 0 && h.author) t.artists = [{ name: h.author }];
  return { kind: 'album', id, title: h.title, subtitle: [h.subtitle, h.second].filter(Boolean).join(' · '), author: h.author, description: h.description || undefined, year, thumb: h.thumb, tracks };
}

export function playlist(id: string): Promise<Collection> {
  return cached(`playlist:${id}`, 10 * 60_000, () => playlistRaw(id));
}
async function playlistRaw(id: string): Promise<Collection> {
  const c = await yt();
  let p = await c.music.getPlaylist(id);
  const h = headerInfo(p.header);
  const tracks: Track[] = [];
  const collect = () => {
    for (const i of p.items) if (i.is(YTNodes.MusicResponsiveListItem)) {
      const t = trackFromResponsive(i);
      if (t) tracks.push(t);
    }
  };
  collect();
  for (let i = 0; i < 20 && p.has_continuation && tracks.length < 2000; i++) {
    try {
      p = await p.getContinuation();
      collect();
    } catch {
      break;
    }
  }
  return { kind: 'playlist', id, title: h.title, subtitle: [h.subtitle, h.second].filter(Boolean).join(' · '), author: h.author, description: h.description || undefined, thumb: h.thumb ?? tracks[0]?.thumb, tracks };
}

export function artist(id: string): Promise<ArtistPage> {
  return cached(`artist:${id}`, 10 * 60_000, () => artistRaw(id));
}
/** Исполнители, про которых уже известно, что они подтверждены (для галочек в списках). */
const verifiedArtists = new Set<string>();
export const isVerified = (id?: string) => !!id && verifiedArtists.has(id);

/**
 * Галочка и «слушателей за месяц». YouTube Music не отдаёт их в разобранном виде,
 * поэтому смотрим сырой ответ: в шапке канала YouTube — значок подтверждённого/официального
 * исполнителя, в шапке YouTube Music — monthlyListenerCount.
 */
async function artistExtras(c: Innertube, id: string): Promise<{ verified: boolean; monthly?: string }> {
  const [music, channel] = await Promise.all([
    c.actions.execute('/browse', { browseId: id, client: 'YTMUSIC' } as any).catch(() => null),
    c.actions.execute('/browse', { browseId: id } as any).catch(() => null)
  ]);
  const mHead = JSON.stringify((music as any)?.data?.header ?? {});
  const monthly = mHead.match(/"monthlyListenerCount":\{"runs":\[\{"text":"([^"]+)"/)?.[1];
  const cHead = JSON.stringify((channel as any)?.data?.header ?? {});
  const verified = /BADGE_STYLE_TYPE_VERIFIED|CHECK_CIRCLE|AUDIO_BADGE|OFFICIAL_ARTIST/.test(cHead);
  if (verified) verifiedArtists.add(id);
  return { verified, monthly };
}

/** getArtist с повтором: YouTube Music иногда отвечает 400 на отдельные страницы. */
async function getArtistSafe(c: Innertube, id: string) {
  // c переназначается после пересоздания сессии
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await c.music.getArtist(id);
    } catch (e) {
      console.warn(`[artist] ${id}: ${(e as Error).message} (попытка ${attempt + 1})`);
      if (isBadRequest(e)) {
        await resetSession('страница исполнителя');
        c = await yt();
      } else await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

/**
 * Запасная страница исполнителя, если YouTube Music не отдал свою: имя и фото — с канала
 * YouTube, популярные треки и альбомы — из поиска по имени.
 */
async function artistFallback(c: Innertube, id: string, extra: { verified: boolean; monthly?: string }): Promise<ArtistPage> {
  let name = '';
  let thumb: string | undefined;
  try {
    const ch: any = await c.getChannel(id);
    name = ch?.metadata?.title ?? txt(ch?.header?.author?.name) ?? '';
    thumb = ch?.metadata?.avatar?.[0]?.url ?? ch?.metadata?.thumbnail?.[0]?.url;
  } catch (e) {
    console.warn(`[artist] ${id}: канал не открылся — ${(e as Error).message}`);
  }
  if (!name) throw new Error('Страница исполнителя сейчас недоступна');
  const [songs, albums] = await Promise.all([search(name, 'songs').catch(() => null), search(name, 'albums').catch(() => null)]);
  const mine = (songs?.tracks ?? []).filter((t) => t.artists.some((a) => a.id === id || a.name.toLowerCase() === name.toLowerCase()));
  const albumCards = (albums?.albums ?? []).filter((a) => (a.subtitle ?? '').toLowerCase().includes(name.toLowerCase()));
  return {
    id,
    name,
    thumb,
    verified: extra.verified,
    monthly: extra.monthly,
    topTracks: (mine.length ? mine : songs?.tracks ?? []).slice(0, 10),
    sections: albumCards.length ? [{ title: 'Альбомы и синглы', layout: 'cards', items: albumCards }] : []
  };
}

async function artistRaw(id: string): Promise<ArtistPage> {
  const c = await yt();
  const [a, extra] = await Promise.all([getArtistSafe(c, id), artistExtras(c, id).catch(() => ({ verified: false, monthly: undefined }))]);
  if (!a) return artistFallback(c, id, extra);
  const h: any = a.header;
  const page: ArtistPage = {
    id,
    name: txt(h?.title),
    thumb: bestThumb(thumbsOfNode(h?.thumbnail), 1080),
    subscribers: txt(h?.subscription_button?.subscriber_count) || txt(h?.subscribers) || undefined,
    description: txt(h?.description) || undefined,
    verified: extra.verified,
    monthly: extra.monthly,
    topTracks: [],
    sections: []
  };
  for (const s of a.sections) {
    if (s.is(YTNodes.MusicShelf) && page.topTracks.length === 0) {
      page.topTracks = (s.contents ?? []).map((n) => (n.is(YTNodes.MusicResponsiveListItem) ? trackFromResponsive(n) : null)).filter(Boolean) as Track[];
      continue;
    }
    const sec = sectionFromShelf(s);
    if (sec) page.sections.push(sec);
  }
  return page;
}

export function upNext(videoId: string): Promise<Track[]> {
  return withRetry(() => upNextRaw(videoId));
}
async function upNextRaw(videoId: string): Promise<Track[]> {
  const c = await yt();
  const panel = await c.music.getUpNext(videoId, true);
  const out: Track[] = [];
  for (const raw of panel.contents ?? []) {
    const n: any = raw.is(YTNodes.PlaylistPanelVideoWrapper) ? (raw as any).primary : raw;
    if (!n?.is?.(YTNodes.PlaylistPanelVideo)) continue;
    const v = n as YTNodes.PlaylistPanelVideo;
    out.push({
      id: v.video_id,
      title: txt(v.title),
      artists: v.artists?.length ? artistsOf(v.artists) : [{ name: v.author }],
      album: v.album ? { id: v.album.id, name: v.album.name } : undefined,
      durationSec: v.duration?.seconds || undefined,
      thumb: bestThumb(v.thumbnail, 544)
    });
  }
  return out;
}

export async function ytLyrics(videoId: string): Promise<string | null> {
  try {
    const c = await yt();
    const shelf = await c.music.getLyrics(videoId);
    const text = txt(shelf?.description);
    return text || null;
  } catch {
    return null;
  }
}

// --- Потоки ---------------------------------------------------------------------
export interface ResolvedStream extends StreamMeta {
  url: string;
  expiresAt: number;
  /** Заголовки, с которыми нужно запрашивать ссылку (для потоков от yt-dlp) */
  headers?: Record<string, string>;
  /** id формата yt-dlp — при обновлении ссылки берём тот же файл, чтобы трек не оборвался на середине */
  formatId?: string;
  /** Ссылка получена через сервер Lull — привязана к его адресу, качать её тоже через сервер */
  via?: 'relay';
}

const streams = new Map<string, ResolvedStream>();

// Ссылки живут ~6 часов — храним их на диске, чтобы после перезапуска треки включались сразу
const streamsFile = () => path.join(app.getPath('userData'), 'streams.json');
let streamsLoaded = false;
let saveStreamsTimer: ReturnType<typeof setTimeout> | undefined;
function loadStreams() {
  if (streamsLoaded) return;
  streamsLoaded = true;
  try {
    const list = JSON.parse(fs.readFileSync(streamsFile(), 'utf8')) as ResolvedStream[];
    for (const s of list) if (s.expiresAt > Date.now() + 5 * 60_000) streams.set(s.id, s);
  } catch {
    /* файла ещё нет */
  }
}
function rememberStream(id: string, s: ResolvedStream) {
  streams.set(id, s);
  clearTimeout(saveStreamsTimer);
  saveStreamsTimer = setTimeout(() => {
    try {
      const fresh = [...streams.values()].filter((x) => x.expiresAt > Date.now()).slice(-400);
      fs.writeFileSync(streamsFile(), JSON.stringify(fresh));
    } catch {
      /* не критично */
    }
  }, 2000);
}

// Заранее (следующие треки) получаем ссылки по одной — чтобы не отнимать ресурсы у текущего трека
let prefetchBusy = false;
const prefetchWaiters: Array<() => void> = [];
async function prefetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (prefetchBusy) await new Promise<void>((r) => prefetchWaiters.push(r));
  prefetchBusy = true;
  try {
    return await fn();
  } finally {
    prefetchBusy = false;
    prefetchWaiters.shift()?.();
  }
}
const pending = new Map<string, Promise<ResolvedStream>>();

// Заранее — пачками: треки, попросившие ссылку почти одновременно, получают её одним запуском yt-dlp
const batchWait = new Map<string, Array<{ ok: (s: ResolvedStream) => void; fail: (e: unknown) => void }>>();
let batchTimer: ReturnType<typeof setTimeout> | undefined;
function batchPrefetch(id: string): Promise<ResolvedStream> {
  const inflight = pending.get(id);
  if (inflight) return inflight;
  // Через сервер Lull заготовки быстрые и параллельные сами по себе
  if (relayOn()) return resolveStream(id, { background: true });
  return new Promise((ok, fail) => {
    const list = batchWait.get(id) ?? [];
    list.push({ ok, fail });
    batchWait.set(id, list);
    clearTimeout(batchTimer);
    batchTimer = setTimeout(() => void flushBatch(), batchWait.size >= 6 ? 0 : 350);
  });
}
async function flushBatch() {
  const ids = [...batchWait.keys()].slice(0, 4);
  const waiters = ids.map((i) => [i, batchWait.get(i)!] as const);
  ids.forEach((i) => batchWait.delete(i));
  if (batchWait.size) batchTimer = setTimeout(() => void flushBatch(), 350);
  await prefetchSlot(async () => {
    // yt-dlp разбирает видео пачки по очереди, поэтому параллельные запуски (до 4) выходят быстрее
    const got = new Map<string, DlpStream>();
    const t0 = Date.now();
    const need = ids.filter((i) => (streams.get(i)?.expiresAt ?? 0) <= Date.now()).slice(0, 4);
    await Promise.all(need.map((i) => ytdlpResolve(i, mainSettings().quality, { kind: 'background' }).then((d) => void got.set(i, d)).catch((e) => console.warn(`[stream] ${i} — заранее не вышло: ${(e as Error).message}`))));
    if (need.length) console.log(`[stream] заранее ${got.size}/${need.length} за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
    for (const [i, ws] of waiters) {
      const hit = streams.get(i);
      if (hit && hit.expiresAt > Date.now()) { ws.forEach((w) => w.ok(hit)); continue; }
      const d = got.get(i);
      if (!d) { ws.forEach((w) => w.fail(new Error('нет в пачке'))); continue; }
      try {
        const s = await finishDlp(i, d);
        rememberStream(i, s);
        console.log(`[stream] ${i} — готов заранее (пачка)`);
        ws.forEach((w) => w.ok(s));
      } catch (e) {
        ws.forEach((w) => w.fail(e));
      }
    }
  });
}

type AudioFormat = {
  has_audio: boolean;
  has_video: boolean;
  bitrate: number;
  mime_type: string;
  content_length?: number;
  approx_duration_ms: number;
  loudness_db?: number;
  decipher(player?: unknown): Promise<string>;
};

function pickFormat(formats: AudioFormat[]): AudioFormat | undefined {
  const audio = formats.filter((f) => f.has_audio && !f.has_video && f.content_length);
  if (audio.length === 0) return undefined;
  audio.sort((a, b) => b.bitrate - a.bitrate);
  const q = mainSettings().quality;
  if (q === 'low') return audio[audio.length - 1];
  // Opus 160 (itag 251, webm) или AAC 128 (itag 140, mp4)
  if (q === 'opus') return audio.find((f) => f.mime_type.includes('opus')) ?? audio[0];
  if (q === 'aac') return audio.find((f) => f.mime_type.includes('mp4a')) ?? audio[0];
  return audio[0];
}

async function resolveWith(load: () => Promise<any>, id: string): Promise<ResolvedStream> {
  const c = await yt();
  const info = await load();
  const status = info.playability_status?.status;
  if (status && status !== 'OK') throw new Error(info.playability_status?.reason || `Трек недоступен (${status})`);
  const format = pickFormat(info.streaming_data?.adaptive_formats ?? []);
  if (!format) throw new Error('Нет аудиопотока');
  const url = await format.decipher(c.session.player);
  const expire = Number(new URL(url).searchParams.get('expire'));
  return {
    id,
    url,
    mime: format.mime_type.split(';')[0],
    bitrate: format.bitrate,
    contentLength: format.content_length ?? 0,
    durationSec: Math.round(format.approx_duration_ms / 1000),
    loudnessDb: format.loudness_db ?? info.player_config?.audio_config?.loudness_db ?? 0,
    expiresAt: expire ? expire * 1000 - 60_000 : Date.now() + 5 * 3600_000,
    // Встроенный клиент при включённом сервере ходит через него — и ссылка привязана к серверу
    ...(relayOn() ? { via: 'relay' as const } : {})
  };
}

/** Обещание с ограничением по времени: зависший запрос не должен вешать воспроизведение. */
export function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}

/** Получить прямую ссылку на аудио: встроенный клиент, а если YouTube отказывает — yt-dlp. */
export async function resolveStream(id: string, opts: { preferDlp?: boolean; prefetch?: boolean; formatId?: string; background?: boolean; keep?: boolean } = {}): Promise<ResolvedStream> {
  loadStreams();
  if (opts.prefetch) {
    // Заранее — в очереди по одному; если трек уже включили, его запрос пойдёт сам, без очереди
    const hit = streams.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit;
    console.log(`[stream] ${id} — готовлю заранее`);
    return batchPrefetch(id).catch(() => prefetchSlot(() => resolveStream(id, { ...opts, prefetch: false, background: true })));
  }
  // Клип недоступен (регион, удалён) — играем найденную замену той же песни
  loadAlts();
  if ((deadIds.get(id) ?? 0) > Date.now()) throw new Error('YouTube не отдаёт этот трек в твоём регионе');
  const sub = alts.get(id);
  if (sub) return resolveStream(sub, opts).then((s) => ({ ...s, id }));
  const cached0 = streams.get(id);
  // Ссылка от сервера без сервера не откроется (и наоборот прямые — годятся всегда)
  const cached = cached0?.via === 'relay' && !relayOn() ? undefined : cached0;
  if (cached && cached.expiresAt > Date.now() && !opts.preferDlp && (!opts.formatId || cached.formatId === opts.formatId)) return cached;
  const inflight = pending.get(id);
  if (inflight) return inflight;
  // Пользователь включил трек — остальная работа (заранее и для брошенных треков) не должна отнимать у него время
  if (!opts.background && !opts.keep) stopOthers(id);

  const task = (async () => {
    // Два способа наперегонки: встроенный клиент быстрый, yt-dlp надёжный.
    // Если первый не ответил за несколько секунд — параллельно запускаем второй, берём кто успел.
    const dlp = (x: string) => viaYtDlp(x, opts.formatId, opts.keep ? 'keep' : opts.background ? 'background' : 'play');
    // Нужен конкретный формат (докачка того же файла) — его умеет выбрать только yt-dlp
    const server = relayOn();
    const first = opts.preferDlp || opts.formatId ? dlp : server ? viaRelay : innertubeFails >= 2 || innertubeBlockedUntil() > Date.now() ? dlp : viaInnertube;
    const second = first === dlp ? (server ? viaRelay : viaInnertube) : first === viaRelay ? (innertubeFails >= 2 ? dlp : viaInnertube) : dlp;
    const name = (w: typeof first) => (w === viaInnertube ? 'встроенный клиент' : w === viaRelay ? 'сервер Lull' : 'yt-dlp');
    const errors: string[] = [];
    const attempt = (w: typeof first) =>
      w(id).then(
        (s) => {
          if (w === viaInnertube) innertubeFails = 0;
          console.log(`[stream] ${id} — получен за ${((Date.now() - t0) / 1000).toFixed(1)} с (${name(w)})`);
          return s;
        },
        (e) => {
          // «Подтвердите, что вы не бот» — YouTube не пускает встроенный клиент с этого адреса; дальше сразу yt-dlp
          const bot = /не бот|not a bot|LOGIN_REQUIRED|Sign in/i.test(String((e as Error)?.message));
          if (w === viaInnertube) innertubeFails = bot ? 5 : innertubeFails + 1;
          // Запоминаем и после перезапуска: 6 часов не тратим время на встроенный клиент
          if (w === viaInnertube && bot) storeSet('innertubeBlockedUntil', Date.now() + 6 * 3600_000);
          const msg = `${name(w)}: ${(e as Error)?.message ?? e}`;
          errors.push(msg);
          console.warn(`[stream] ${id} — ${msg}`);
          throw e;
        }
      );
    const t0 = Date.now();
    console.log(`[stream] ${id} — запрашиваю`);
    const p1 = attempt(first);
    // YouTube требует «подтвердить, что не бот» — встроенный клиент не запускаем вовсе, только yt-dlp
    // Ни один способ не сработал: если сам ролик недоступен — ищем ту же песню другим роликом
    const fail = async (): Promise<ResolvedStream> => {
      const unavailable = errors.some(isVideoUnavailable);
      const alt = unavailable ? await findAlternative(id) : null;
      if (alt) return resolveStream(alt, { ...opts, formatId: undefined }).then((s) => ({ ...s, id }));
      if (unavailable) deadIds.set(id, Date.now() + 6 * 3600_000);
      throw new Error(unavailable ? 'YouTube не отдаёт этот трек в твоём регионе' : errors.join(' | ') || 'Не удалось получить поток');
    };
    if (opts.formatId || (!server && first === dlp && (innertubeFails >= 5 || innertubeBlockedUntil() > Date.now()))) {
      return selectStream([p1], (s) => rememberStream(id, s)).catch(fail);
    }
    // Иначе оба способа сразу и параллельно — берём того, кто ответил первым
    const p2 = attempt(second).catch((error) => {
      // A fast built-in-client failure must not leave playback waiting only
      // for every server retry when local yt-dlp can still resolve the track.
      if (server && second === viaInnertube) return attempt(dlp);
      throw error;
    });
    try {
      return await selectStream([p1, p2], (s) => rememberStream(id, s));
    } catch {
      return fail();
    }
  })().finally(() => pending.delete(id));
  pending.set(id, task);
  return task;
}

// Подсказки «название — исполнитель»: по ним ищем замену, если сам ролик недоступен
const hints = new Map<string, { title: string; artist: string; duration?: number }>();
export const hintFor = (id: string) => hints.get(id);
const alts = new Map<string, string>();
const deadIds = new Map<string, number>(); // нет ни ролика, ни замены — не мучаем повторно 6 часов
const altsFile = () => path.join(app.getPath('userData'), 'alts.json');
let altsLoaded = false;
function loadAlts() {
  if (altsLoaded) return;
  altsLoaded = true;
  try {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(altsFile(), 'utf8')) as Record<string, string>)) alts.set(k, v);
  } catch {
    /* файла ещё нет */
  }
}
function saveAlts() {
  try {
    fs.writeFileSync(altsFile(), JSON.stringify(Object.fromEntries([...alts].slice(-2000))));
  } catch {
    /* не критично */
  }
}
export function rememberHint(id: string, h: { title: string; artist: string; duration?: number }) {
  const prev = hints.get(id);
  hints.set(id, { ...prev, ...h, duration: h.duration || prev?.duration });
  if (hints.size > 5000) hints.delete(hints.keys().next().value as string);
}
const norm = (x: string) => x.toLowerCase().replace(/\(.*?\)|\[.*?\]|official|video|audio|lyrics?/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
async function findAlternative(id: string): Promise<string | null> {
  const h = hints.get(id);
  if (!h) {
    console.warn(`[stream] ${id} недоступен, а названия трека нет — замену искать не по чему`);
    return null;
  }
  const want = norm(h.title);
  const artist = norm(h.artist);
  const same = (t: Track) => {
    const n = norm(t.title);
    const titleOk = !!n && (n === want || n.startsWith(want) || want.startsWith(n));
    const artistOk = !artist || t.artists?.some((a) => norm(a.name).includes(artist) || artist.includes(norm(a.name)));
    return titleOk && artistOk;
  };
  // Сначала песни (официальные аудио «Topic» почти всегда открыты), потом клипы и любые видео
  for (const [q, f] of [[`${h.title} ${h.artist}`, 'songs'], [`${h.title} ${h.artist}`, 'all'], [h.title, 'songs']] as const) {
    try {
      const r = await searchRaw(q, f);
      const pick = r.tracks.find((t) => t.id !== id && deadIds.get(t.id) === undefined && same(t));
      if (!pick) continue;
      console.log(`[stream] ${id} («${h.title}») недоступен — играю замену ${pick.id}`);
      alts.set(id, pick.id);
      saveAlts();
      return pick.id;
    } catch (e) {
      console.warn(`[stream] поиск замены для ${id}: ${(e as Error).message}`);
    }
  }
  console.warn(`[stream] ${id} («${h.title}») — замена не найдена`);
  return null;
}

let innertubeFails = 0;
const innertubeBlockedUntil = () => storeGet<number>('innertubeBlockedUntil') ?? 0;
/** Ссылка встроенного клиента отдала 403 на кусок — следующие треки сразу через yt-dlp. */
export function markInnertubeFailed() {
  innertubeFails = Math.max(innertubeFails, 2);
}
// Раз в 10 минут снова даём шанс встроенному клиенту (он быстрее)
setInterval(() => (innertubeFails = Math.min(innertubeFails, 1)), 10 * 60_000).unref?.();

export async function viaInnertube(id: string): Promise<ResolvedStream> {
  try {
    return await withTimeout(resolveAll(id), 25_000, 'таймаут получения потока');
  } catch (e) {
    // Сессия могла испортиться (400) — пересоздаём и пробуем ещё раз
    if (!isBadRequest(e)) throw e;
    await resetSession(`поток ${id}: ${(e as Error).message}`);
    return withTimeout(resolveAll(id), 20_000, 'таймаут получения потока');
  }
}

// Ссылка от yt-dlp отдала 403 — для этого трека пробуем другого клиента YouTube (у каждого свои правила)
const forbidden = new Map<string, number>();
const FALLBACK_CLIENTS = ['tv', 'web_safari', 'mweb', 'web_embedded'];
export function noteForbidden(id: string) {
  forbidden.set(id, (forbidden.get(id) ?? 0) + 1);
  if (forbidden.size > 200) forbidden.delete(forbidden.keys().next().value as string);
}

export async function viaYtDlp(id: string, formatId?: string, kind: 'background' | 'play' | 'keep' = 'play'): Promise<ResolvedStream> {
  const n = forbidden.get(id) ?? 0;
  const client = n ? FALLBACK_CLIENTS[(n - 1) % FALLBACK_CLIENTS.length] : undefined;
  const d = await ytdlpResolve(id, mainSettings().quality, { formatId: client ? undefined : formatId, kind, client });
  return finishDlp(id, d);
}

/** Превращает ответ yt-dlp в поток плеера. Размер известен — лишний запрос к серверу не делаем (экономит ~0,5 с). */
async function finishDlp(id: string, d: DlpStream, viaServer = false): Promise<ResolvedStream> {
  let total = d.contentLength;
  if (!total) {
    const r = await withTimeout(xfetch(d.url, { headers: { ...d.headers, Range: 'bytes=0-0' }, direct: !viaServer }), 10_000, 'таймаут проверки потока');
    if (!r.ok) throw new Error(`Сервер отклонил поток (${r.status})`);
    total = Number(r.headers.get('content-range')?.split('/')[1]) || 0;
    void r.body?.cancel();
  }
  if (!total) throw new Error('Неизвестен размер потока');
  const expire = Number(new URL(d.url).searchParams.get('expire'));
  return {
    id,
    url: d.url,
    headers: d.headers,
    mime: d.mime,
    bitrate: d.bitrate,
    contentLength: total,
    durationSec: d.durationSec,
    loudnessDb: 0,
    expiresAt: expire ? expire * 1000 - 60_000 : Date.now() + 3 * 3600_000,
    formatId: d.formatId
  };
}

/** Кусок аудио по байтам — с учётом того, откуда получена ссылка. */
export function fetchRange(s: ResolvedStream, start: number, end: number): Promise<Response> {
  const direct = s.via !== 'relay';
  if (s.headers) return xfetch(s.url, { headers: { ...s.headers, Range: `bytes=${start}-${end}` }, direct });
  return xfetch(`${s.url}&range=${start}-${end}`, { direct });
}

/** Ссылка на звук от сервера Lull: там yt-dlp «прогрет», готовые ссылки общие — обычно ~1 с. */
export async function viaRelay(id: string): Promise<ResolvedStream> {
  const q = mainSettings().quality === 'aac' ? 'aac' : mainSettings().quality === 'low' ? 'low' : 'auto';
  // Ссылка с сервера уже отдала 403 — просим сервер получить новую, мимо его кэша
  const fresh = forbidden.get(id) ? '&fresh=1' : '';
  const r = await withTimeout(relayApi(`/resolve/${encodeURIComponent(id)}?q=${q}${fresh}`), 45_000, 'сервер Lull не ответил').catch((e) => {
    markRelayDown(e);
    throw e;
  });
  const j = (await r.json()) as DlpStream & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error || `сервер Lull: ${r.status}`);
  const s = await finishDlp(id, j, true);
  return { ...s, via: 'relay' };
}

async function resolveAll(id: string): Promise<ResolvedStream> {
  const c = await yt();
  const attempts: Array<() => Promise<any>> = [
    () => c.music.getInfo(id),
    () => c.getBasicInfo(id, { client: 'ANDROID_VR' } as any),
    () => c.getBasicInfo(id, { client: 'TV' } as any)
  ];
  let lastError: unknown;
  for (const load of attempts) {
    try {
      const s = await withTimeout(resolveWith(load, id), 10_000, 'таймаут получения потока');
      if (await withTimeout(probe(s.url, s.contentLength), 6_000, 'таймаут проверки потока').catch(() => false)) return s;
      lastError = new Error('Ссылка на поток отклонена сервером');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось получить поток');
}

/** Быстрая проверка, что ссылка отдаёт данные (первые байты). */
async function probe(url: string, len = 0): Promise<boolean> {
  try {
    // Проверяем и начало, и середину: без PO-токена YouTube отдаёт первые байты, а дальше — 403
    const mid = len > 4_000_000 ? Math.floor(len / 2) : len > 1_100_000 ? 1_048_576 : 0;
    const [a, b] = await Promise.all([xfetch(`${url}&range=0-1`), mid ? xfetch(`${url}&range=${mid}-${mid + 1048575}`) : Promise.resolve(null)]);
    void b?.body?.cancel();
    return a.ok && (!b || b.ok);
  } catch {
    return false;
  }
}

export function invalidateStream(id: string) {
  const seen = new Set<string>();
  let key: string | undefined = id;
  while (key && !seen.has(key)) {
    seen.add(key);
    streams.delete(key);
    key = alts.get(key);
  }
}

// --- Аккаунт -------------------------------------------------------------------------
export interface YtChannel {
  name: string;
  handle?: string;
  photo?: string;
  pageId?: string;
  selected: boolean;
}

export async function accountChannels(): Promise<YtChannel[]> {
  const c = await yt();
  const items: any[] = await (c.account as any).getInfo(true);
  return (items ?? []).map((a) => {
    const tokens: any[] = a.endpoint?.payload?.supportedTokens ?? [];
    const pageId = tokens.find((t) => t.pageIdToken)?.pageIdToken?.pageId;
    return { name: txt(a.account_name), handle: txt(a.channel_handle) || undefined, photo: bestThumb(a.account_photo, 120), pageId, selected: onBehalfOf ? pageId === onBehalfOf : !!a.is_selected };
  });
}

/** Плейлисты аккаунта и понравившиеся треки (LM). */
export function accountLibrary(): Promise<{ playlists: Card[]; liked: Track[] }> {
  return withRetry(() => accountLibraryRaw());
}
async function accountLibraryRaw(): Promise<{ playlists: Card[]; liked: Track[] }> {
  const c = await yt();
  const playlists: Card[] = [];
  try {
    const lib: any = await c.music.getLibrary();
    for (const sec of lib.contents ?? []) {
      for (const n of sec.items ?? sec.contents ?? []) {
        const card = safeCard(n);
        if (card && card.kind === 'playlist' && card.id !== 'LM') playlists.push(card);
      }
    }
  } catch {
    /* библиотека может быть пустой */
  }
  let liked: Track[] = [];
  try {
    liked = (await playlistRaw('LM')).tracks;
  } catch {
    /* нет лайков */
  }
  return { playlists, liked };
}
