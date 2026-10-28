import type { Api } from '../../shared/api';
import type { Track, StreamMeta } from '../../shared/types';

/**
 * Api для веб-версии, PWA и Android: каталог и звук — с сервера Lull (api.lull.website),
 * библиотека и настройки — в памяти браузера.
 */
export const API_BASE = (import.meta.env.VITE_LULL_API as string | undefined) ?? 'https://api.lull.website';

const get = async <T>(path: string): Promise<T> => {
  const r = await fetch(`${API_BASE}/api/${path}`, { signal: AbortSignal.timeout(15000) }).catch(() => {
    throw new Error(navigator.onLine ? 'Нет связи с сервером Lull — попробуй ещё раз' : 'Нет интернета');
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Сервер ответил ${r.status}`);
  return r.json() as Promise<T>;
};
const enc = encodeURIComponent;
const streamHints = new Map<string, { title: string; artist: string; duration?: number }>();
const preparing = new Map<string, Promise<StreamMeta>>();
const prepared = new Map<string, { at: number; meta: StreamMeta }>();
const streamQuery = (id: string) => {
  const hint = streamHints.get(id);
  const query = new URLSearchParams({ q: quality() });
  if (hint) { query.set('t', hint.title); query.set('a', hint.artist); if (hint.duration) query.set('d', String(hint.duration)); }
  return query.toString();
};

// Хранилище: localStorage, по ключу на запись (как файлы в десктопе)
const PREFIX = 'lull:';
const mem = new Map<string, unknown>();
const readStore = <T>(k: string): T | undefined => {
  if (mem.has(k)) return mem.get(k) as T;
  try {
    const raw = localStorage.getItem(PREFIX + k);
    const v = raw == null ? undefined : (JSON.parse(raw) as T);
    mem.set(k, v);
    return v;
  } catch {
    return undefined;
  }
};
const timers = new Map<string, number>();
const writeStore = (k: string, v: unknown) => {
  if (k.startsWith('account_')) {
    // A queued cloud edit must survive an immediate tab close or restart.
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
    mem.set(k, v);
    return;
  }
  mem.set(k, v);
  clearTimeout(timers.get(k));
  timers.set(
    k,
    window.setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + k, JSON.stringify(v));
      } catch {
        /* хранилище переполнено — работаем без сохранения */
      }
    }, 300)
  );
};

const unsupported = (what: string) => () => Promise.reject(new Error(`${what} доступно в приложении для компьютера`));
const noop = () => {};
const off = () => noop;
const quality = () => {
  // Opus (webm) не играет на iPhone — там всегда AAC
  const q = (readStore<{ quality?: string }>('settings')?.quality ?? 'auto') as string;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return 'aac';
  return q === 'low' ? 'low' : q === 'opus' || q === 'high' ? 'auto' : 'aac';
};

export const httpApi: Api = {
  platform: 'web',
  home: (chip) => get(`home${chip ? `?chip=${enc(chip)}` : ''}`),
  homeChips: () => get('chips'),
  charts: () => get('charts'),
  search: (q, f) => get(`search?q=${enc(q)}&f=${f ?? 'all'}`),
  suggest: (q) => (q.trim() ? get(`suggest?q=${enc(q)}`) : Promise.resolve([])),
  suggestRich: (q) => get(`suggest-rich?q=${enc(q)}`),
  album: (id) => get(`album/${enc(id)}`),
  playlist: (id) => get(`playlist/${enc(id)}`),
  artist: (id) => get(`artist/${enc(id)}`),
  upNext: (id) => get(`upnext/${enc(id)}`),
  lyrics: async (track: Track) => {
    const r = await fetch(`${API_BASE}/api/lyrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(track), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
    return r.json();
  },

  streamUrl: (id) => `${API_BASE}/api/stream/${enc(id)}?${streamQuery(id)}`,
  imageUrl: (src) => (/^https:\/\/([a-z0-9-]+\.)*(ytimg\.com|ggpht\.com|googleusercontent\.com)\//.test(src) ? `${API_BASE}/api/img?u=${enc(src)}&iv=2` : src),
  prepareStream: (id, _prefetch, hint) => {
    if (hint) {
      streamHints.set(id, hint);
      if (streamHints.size > 500) streamHints.delete(streamHints.keys().next().value!);
    }
    const key = `${quality()}:${id}`;
    const hit = prepared.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return Promise.resolve(hit.meta);
    const active = preparing.get(key);
    if (active) return active;
    const task = get<StreamMeta>(`prepare/${enc(id)}?${streamQuery(id)}`).then(meta => {
      prepared.set(key, { at: Date.now(), meta });
      if (prepared.size > 200) prepared.delete(prepared.keys().next().value!);
      return meta;
    }).finally(() => preparing.delete(key));
    preparing.set(key, task);
    return task;
  },
  relayHealth: async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(`${API_BASE}/api/health`);
      return { ok: r.ok, ms: Math.round(performance.now() - t0), detail: r.ok ? 'api.lull.website' : `ответ ${r.status}` };
    } catch (e) {
      return { ok: false, ms: Math.round(performance.now() - t0), detail: (e as Error).message };
    }
  },

  storeGet: async (k) => readStore(k),
  storeSet: async (k, v) => writeStore(k, v),

  download: unsupported('Скачивание'),
  removeDownload: async () => {},
  listDownloads: async () => ({}),
  onDownloadProgress: off,

  windowMinimize: noop,
  windowToggleMaximize: noop,
  windowClose: noop,
  onMaximizedChange: off,

  visitorData: async () => '',
  setPoToken: async () => {},
  netFetch: async () => ({ status: 0, text: '' }),

  ytLogin: async () => false,
  ytLogout: async () => {},
  ytAccount: async () => ({ signedIn: false, channels: [] }),
  ytSelectChannel: async () => {},
  ytLibrary: async () => ({ playlists: [], liked: [] }),

  discordStatus: async () => ({ connected: false }),
  importPlaylist: unsupported('Импорт плейлистов'),
  onImportProgress: off,

  overlayConfigure: async () => {},
  overlayPush: noop,
  onOverlayState: off,
  onOverlayOptions: off,
  setHotkeys: async () => ({}),
  onHotkey: off,

  discordActivity: async () => {},
  discordConfigure: async () => {},
  openExternal: async (url) => void window.open(url, '_blank', 'noopener'),
  cacheInfo: async () => {
    const e = await navigator.storage?.estimate?.().catch(() => null);
    return { bytes: e?.usage ?? 0, downloadsBytes: 0 };
  },
  clearCache: async () => {
    const keys = await caches?.keys?.().catch(() => [] as string[]);
    await Promise.all((keys ?? []).filter((k) => k.startsWith('lull-img')).map((k) => caches.delete(k)));
  },
  appVersion: async () => (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '1.0.0',
  diagnose: async () => [],
  openLogs: async () => {}
};
