import type { Api } from '../../shared/api';
import type { ArtistPage, Card, Collection, DownloadEntry, HomeSection, ImportProgress, Track } from '../../shared/types';

// Тестовые данные для разработки интерфейса без Electron и сети.
// Обложки — сгенерированные SVG, звук — синтезированный тон.

const palettes = [
  ['#3D2C5E', '#121019', '#E9D8C4'],
  ['#0F3D3E', '#082021', '#9AD1D4'],
  ['#3B1E2A', '#1A1A1F', '#B23A48'],
  ['#2F6FD6', '#0E2A5C', '#C9DBFF'],
  ['#F78154', '#4D9078', '#F2C14E'],
  ['#C9CED6', '#24272C', '#5E6670'],
  ['#C98B8B', '#6E3B4E', '#F4D9C6'],
  ['#1F8A70', '#0B2E26', '#7EE2A8']
];

function art(seed: number): string {
  const [a, b, c] = palettes[seed % palettes.length];
  const cx = 30 + ((seed * 37) % 45);
  const cy = 25 + ((seed * 53) % 50);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="${cx}" cy="${cy}" r="${10 + (seed % 4) * 3}" fill="${c}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const artistsList = ['Мира Велес', 'Плёнка', 'Lumen Drift', 'Kōsa', 'Ночной Сигнал', 'Тихая Гавань', 'Orbita'];
const titles = ['Синий час', 'Вдоль линии', 'Afterglow', 'Северный ветер', 'Сигнал', 'Гавань', 'Перигей', 'Медленный свет', 'Жёлтые окна', 'Low Tide', 'Зерно', 'Компас', 'Причал', 'Тихие окна', 'Серый сезон', 'Дорога на юг'];

const tracks: Track[] = titles.map((title, i) => ({
  id: `mock${i}`,
  title,
  artists: [{ id: `artist${i % artistsList.length}`, name: artistsList[i % artistsList.length] }],
  album: { id: `album${i % 6}`, name: titles[(i + 3) % titles.length] },
  durationSec: 150 + ((i * 41) % 180),
  thumb: art(i)
}));

const trackCard = (t: Track): Card => ({ kind: 'track', id: t.id, title: t.title, subtitle: t.artists[0].name, thumb: t.thumb, track: t });
const albumCard = (i: number): Card => ({ kind: 'album', id: `album${i}`, title: titles[(i + 3) % titles.length], subtitle: `${artistsList[i % artistsList.length]} · ${2020 + (i % 6)}`, thumb: art(i + 3) });
const playlistCard = (i: number, title: string, subtitle: string): Card => ({ kind: 'playlist', id: `pl${i}`, title, subtitle, thumb: art(i + 5) });
const artistCard = (i: number): Card => ({ kind: 'artist', id: `artist${i}`, title: artistsList[i], subtitle: 'Исполнитель', thumb: art(i + 1) });

const delay = <T>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

const home: HomeSection[] = [
  { title: 'Топ альбомов', layout: 'cards', items: [0, 1, 2, 3, 4, 5, 6, 7].map(albumCard) },
  { title: 'Сейчас слушают', layout: 'tracks', items: tracks.slice(0, 10).map(trackCard) },
  { title: 'Собрано для тебя', subtitle: 'Обновляется каждый день', layout: 'cards', items: [
    playlistCard(1, 'Микс дня 1', 'Мира Велес, Плёнка, Kōsa'),
    playlistCard(2, 'Микс дня 2', 'Lumen Drift, Тихая Гавань'),
    playlistCard(3, 'Открытия недели', '30 новых треков'),
    playlistCard(4, 'Радар релизов', 'Свежее от твоих артистов'),
    playlistCard(5, 'На повторе', 'То, что ты слушаешь чаще'),
    playlistCard(6, 'Вечерний микс', 'Медленнее и тише')
  ] },
  { title: 'Исполнители для тебя', layout: 'cards', items: [0, 1, 2, 3, 4, 5, 6].map(artistCard) }
];

let mockSignedIn = sessionStorage.getItem('mock-yt') === '1';
let mockChannel: string | null = null;
const importListeners = new Set<(p: ImportProgress) => void>();
const storage = new Map<string, unknown>();
try {
  const raw = localStorage.getItem('mock-store');
  if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) storage.set(k, v);
} catch {
  /* нет доступа к localStorage */
}

const toneCache = new Map<string, string>();
function tone(id: string, seconds: number): string {
  const hit = toneCache.get(id);
  if (hit) return hit;
  const rate = 8000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  const f = 220 + (id.length * 37 + id.charCodeAt(id.length - 1) * 3) % 220;
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 800, (n - i) / 800);
    v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * f * i) / rate) * 3000 * env, true);
  }
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  toneCache.set(id, url);
  return url;
}

const collection = (id: string, kind: 'album' | 'playlist'): Collection => {
  const seed = Number(id.replace(/\D/g, '')) || 0;
  return {
    kind,
    id,
    title: kind === 'album' ? titles[(seed + 3) % titles.length] : ['Микс дня 1', 'Микс дня 1', 'Микс дня 2', 'Открытия недели', 'Радар релизов', 'На повторе', 'Вечерний микс'][seed] ?? 'Плейлист',
    subtitle: kind === 'album' ? `Альбом · ${2020 + (seed % 6)}` : 'Плейлист · YouTube Music',
    author: artistsList[seed % artistsList.length],
    year: String(2020 + (seed % 6)),
    description: kind === 'playlist' ? 'Подборка обновляется каждый день по твоим прослушиваниям.' : undefined,
    thumb: art(seed + (kind === 'album' ? 3 : 5)),
    tracks: tracks.slice(seed % 4, (seed % 4) + 12)
  };
};

const overlayBus = new BroadcastChannel('mock-overlay');

export const mockApi: Api = {
  diagnose: () => delay([{ name: 'YouTube — встроенный клиент', ok: false, ms: 2100, detail: 'Ссылка на поток отклонена сервером' }, { name: 'yt-dlp — версия', ok: true, ms: 300, detail: '2026.10.21' }, { name: 'YouTube — через yt-dlp', ok: true, ms: 4200, detail: 'audio/webm, 160 кбит/с, 3.4 МБ' }], 600),
  openLogs: () => delay(undefined),
  platform: 'web',
  home: (chip) => delay(chip ? home.map((sec, k) => ({ ...sec, title: k === 0 ? `${chip}: подборка` : sec.title, items: [...sec.items].reverse() })) : home),
  homeChips: () => delay(['Энергичная', 'Расслабление', 'Для тренировок', 'Для вечеринок', 'Для концентрации', 'Грустная', 'Романтическая', 'В дорогу', 'Для сна']),
  charts: () =>
    delay([
      { title: 'Топ-чарт: треки', layout: 'tracks', items: [...tracks].reverse().slice(0, 10).map(trackCard) },
      { title: 'Популярные альбомы', layout: 'cards', items: [5, 4, 3, 2, 1, 0].map(albumCard) }
    ] as HomeSection[]),
  search: (query) =>
    delay({
      query,
      top: artistCard(0),
      tracks: tracks.filter((t, i) => i < 6 || t.title.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
      albums: [0, 1, 2, 3, 4, 5].map(albumCard),
      artists: [0, 1, 2, 3, 4, 5].map(artistCard),
      playlists: [1, 2, 3, 4].map((i) => playlistCard(i, `Плейлист ${i}`, 'YouTube Music'))
    }),
  suggestRich: (q) => delay({ query: q, queries: q ? [q, `${q} remix`, `${q} slowed`] : [], items: q ? [artistCard(1), { kind: 'track' as const, id: tracks[2].id, title: tracks[2].title, subtitle: tracks[2].artists[0].name, thumb: tracks[2].thumb, track: tracks[2] }, albumCard(2)] : [] }, 60),
  suggest: (q) => delay(q ? [`${q}`, `${q} remix`, `${q} live`, `${q} slowed`] : [], 80),
  album: (id) => delay(collection(id, 'album')),
  playlist: (id) => delay(collection(id, 'playlist')),
  artist: (id) => {
    const i = Number(id.replace(/\D/g, '')) || 0;
    const page: ArtistPage = {
      id,
      name: artistsList[i % artistsList.length],
      thumb: art(i + 1),
      subscribers: '1,2 млн подписчиков',
      monthly: `${(4 + i * 3) % 50 + 1},${i % 9} млн слушателей за месяц`,
      verified: i % 3 !== 2,
      description: 'Описание исполнителя появится здесь.',
      topTracks: tracks.slice(0, 8).map((t, k) => (k % 3 === 0 ? { ...t, explicit: true } : t)),
      sections: [
        { title: 'Альбомы', layout: 'cards', items: [0, 1].map((k) => ({ ...albumCard(k), subtitle: String(2024 + k), explicit: k === 1 })) },
        { title: 'Синглы', layout: 'cards', items: [2, 3, 4, 5, 0, 1].map((k) => ({ ...albumCard(k), subtitle: `Сингл · ${2025 + (k % 2)}` })) },
        { title: 'Похожие исполнители', layout: 'cards', items: [1, 2, 3, 4, 5].map((k) => ({ ...artistCard(k), verified: k % 3 !== 2 })) }
      ]
    };
    return delay(page);
  },
  upNext: (id) => delay(tracks.filter((t) => t.id !== id).slice(0, 8)),
  lyrics: async (track?: Track) => {
    // Для демо-трека строки ставятся на реальные вокальные фразы (тайминг из /demo/timing.json)
    const phrases: [number, number][] | null = track?.id.startsWith('demo:') ? await fetch('/demo/timing.json').then((r) => r.json()).catch(() => null) : null;
    const base = ['Мы шли по стеклу до утра,', 'и город звенел под ногами.', 'Я слышу тебя сквозь шум проводов,', 'и свет остаётся в ладонях,', 'пока не погаснут витрины,', 'пока не проснётся река.', 'Останься ещё на куплет.', 'Мы шли по стеклу до утра…'];
    const lines = phrases ? phrases.map((_, i) => base[i % base.length]) : base;
    // TTML с таймингом по словам — так отдаёт Better Lyrics
    const t = (x: number) => x.toFixed(3);
    let at = 3.5;
    const ps = lines.map((line, li) => {
      const words = line.split(' ');
      if (phrases) at = phrases[li][0];
      const dur = phrases ? Math.max(1.2, phrases[li][1] - phrases[li][0]) : 3.2;
      const step = dur / words.length;
      const spans = words.map((w, i) => `<span begin="${t(at + i * step)}" end="${t(at + (i + 1) * step)}">${w}</span>`).join(' ');
      const p = `<p begin="${t(at)}" end="${t(at + dur)}">${spans}</p>`;
      at += dur + 0.5;
      return p;
    });
    const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body><div>${ps.join('')}</div></body></tt>`;
    const synced = lines.map((text, i) => ({ t: phrases ? phrases[i][0] : 3.5 + i * 3.7, text }));
    const a = { synced, plain: null, source: 'betterlyrics' as const, label: 'Better Lyrics', ttml, sync: 'syllable' as const, match: 1 };
    const b = { synced, plain: null, source: 'lrclib' as const, label: 'LRCLIB · 3:41', lrc: synced.map((l) => `[00:${l.t.toFixed(2).padStart(5, '0')}]${l.text}`).join('\n'), sync: 'line' as const, match: 0.994 };
    const c = { synced: null, plain: lines.join('\n'), source: 'youtube' as const, label: 'YouTube Music', sync: 'none' as const, match: 1 };
    return delay({ ...a, alternatives: [a, b, c] });
  },
  // demo:<файл> — настоящий аудиофайл (для записи демо-видео), остальное — синтезированный тон
  streamUrl: (id) => (id.startsWith('demo:') ? `/demo/${id.slice(5)}` : tone(id, 40)),
  imageUrl: (src) => src,
  relayHealth: async () => ({ ok: false, ms: 0, detail: 'В демо-режиме сервер не используется' }),
  prepareStream: (id) => delay({ id, mime: id.startsWith('demo:') ? 'audio/mpeg' : 'audio/wav', bitrate: 128000, contentLength: 0, durationSec: id.startsWith('demo:') ? 206 : 40, loudnessDb: 0 }, 50),
  storeGet: async (k) => storage.get(k) as any,
  storeSet: async (k, v) => {
    storage.set(k, v);
    try {
      localStorage.setItem('mock-store', JSON.stringify(Object.fromEntries(storage)));
    } catch {
      /* без сохранения */
    }
  },
  download: async (t) => {
    const e: DownloadEntry = { track: t, file: `/${t.id}.webm`, size: 4_200_000, mime: 'audio/webm', at: Date.now() };
    return delay(e, 600);
  },
  removeDownload: async () => {},
  listDownloads: async () => ({}),
  onDownloadProgress: () => () => {},
  windowMinimize: () => {},
  windowToggleMaximize: () => {},
  windowClose: () => {},
  onMaximizedChange: () => () => {},
  visitorData: async () => '',
  setPoToken: async () => {},
  netFetch: async () => ({ status: 0, text: '' }),
  discordActivity: async () => {},
  discordConfigure: async () => {},
  openExternal: async (url) => void window.open(url, '_blank'),
  cacheInfo: async () => ({ bytes: 48_000_000, downloadsBytes: 0 }),
  clearCache: async () => {},
  appVersion: async () => '0.1.0-web',
  ytLogin: async () => (sessionStorage.setItem('mock-yt', '1'), (mockSignedIn = true), true),
  ytLogout: async () => (sessionStorage.removeItem('mock-yt'), void (mockSignedIn = false)),
  ytAccount: async () =>
    mockSignedIn
      ? { signedIn: true, channels: [{ name: 'coffee', handle: '@coffee', photo: art(6), pageId: undefined, selected: !mockChannel }, { name: 'Coffee Beats', handle: '@coffeebeats', photo: art(2), pageId: 'brand1', selected: mockChannel === 'brand1' }] }
      : { signedIn: false, channels: [] },
  ytSelectChannel: async (id) => void (mockChannel = id),
  ytLibrary: () => delay({ playlists: [playlistCard(7, 'Мой YouTube-плейлист', '24 трека'), playlistCard(8, 'Для тренировок', '41 трек')], liked: tracks.slice(2, 9) }),
  importPlaylist: async (url) => {
    const total = 12;
    for (let i = 1; i <= total; i++) {
      await new Promise((r) => setTimeout(r, 120));
      importListeners.forEach((cb) => cb({ done: i, total, matched: i === 7 ? i - 1 : Math.min(i, total - 1) }));
    }
    return { name: /spotify/.test(url) ? 'Плейлист из Spotify' : 'Импортированный плейлист', source: /spotify/.test(url) ? 'spotify' : 'youtube', total, tracks: tracks.slice(0, 11), missing: ['Неизвестный — Редкий трек'] };
  },
  onImportProgress: (cb) => (importListeners.add(cb), () => importListeners.delete(cb)),
  // В браузере оверлей открывается отдельной вкладкой #/overlay, связь — через BroadcastChannel
  overlayConfigure: async (o) => overlayBus.postMessage({ type: 'opts', o }),
  overlayPush: (st) => overlayBus.postMessage({ type: 'state', st }),
  onOverlayState: (cb) => {
    const fn = (e: MessageEvent) => e.data?.type === 'state' && cb(e.data.st);
    overlayBus.addEventListener('message', fn);
    return () => overlayBus.removeEventListener('message', fn);
  },
  onOverlayOptions: (cb) => {
    const fn = (e: MessageEvent) => e.data?.type === 'opts' && cb(e.data.o);
    overlayBus.addEventListener('message', fn);
    return () => overlayBus.removeEventListener('message', fn);
  },
  discordStatus: async () => {
    const s = storage.get('settings') as { discordRpc?: boolean } | undefined;
    return s?.discordRpc ? { connected: true, user: { name: 'coffee', avatar: undefined } } : { connected: false };
  },
  setHotkeys: async (m) => Object.fromEntries(Object.keys(m).map((k) => [k, true])),
  onHotkey: () => () => {}
};
