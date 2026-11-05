/* Выход в YouTube через Cloudflare WARP (локальный SOCKS5-прокси на сервере, LULL_YT_PROXY=socks5://127.0.0.1:40000).
   Адрес самого сервера (дата-центр) YouTube режет: файлы обрываются после 256 КБ, «подтвердите, что не бот».
   Через прокси идут только запросы за звуком; каталог, поиск, Telegram, тексты песен и локальные адреса — напрямую.
   Модуль должен импортироваться первым: он подменяет диспетчер у встроенного fetch. */
import type { Dispatcher as D } from 'undici';

/* Через WARP — только то, что связано со звуком: сам файл (googlevideo), запрос плеера и проверка BotGuard.
   Каталог и поиск идут напрямую: через прокси они заметно медленнее, а YouTube их с адреса сервера не режет. */
const via = (host: string, path: string) =>
  /(^|\.)googlevideo\.com$/i.test(host) || /^jnn-pa\.googleapis\.com$/i.test(host) ||
  (/(^|\.)youtube\.com$/i.test(host) && /^\/(youtubei\/v1\/(player|att\/)|api\/jnn\/)/.test(path));
export const ytProxy = process.env.LULL_YT_PROXY || '';

if (ytProxy) {
  try {
    // загружаем только когда прокси включён: новая версия undici требует свежий Node
    const { Agent, Dispatcher, fetch: ufetch, setGlobalDispatcher } = await import('undici');
    const { socksDispatcher } = await import('fetch-socks');
    class Split extends Dispatcher {
      constructor(private direct: D, private proxied: D) { super(); }
      dispatch(opts: D.DispatchOptions, handler: D.DispatchHandler) {
        let host = '';
        try { host = new URL(String(opts.origin)).hostname; } catch {}
        return (via(host, String(opts.path || '')) ? this.proxied : this.direct).dispatch(opts, handler);
      }
      async close() { await Promise.all([this.direct.close(), this.proxied.close()]); }
      async destroy() { await Promise.all([this.direct.destroy(), this.proxied.destroy()]); }
    }
    const u = new URL(ytProxy);
    const socks = socksDispatcher({ type: 5, host: u.hostname, port: Number(u.port) || 1080 }, { connect: { timeout: 10_000 } } as any);
    setGlobalDispatcher(new Split(new Agent(), socks as any) as any);
    // встроенный fetch Node может быть другой версии undici, чем диспетчер — берём fetch той же версии
    // youtubei.js передаёт в fetch встроенный Request — для другой версии undici это чужой объект, разворачиваем его
    (globalThis as any).fetch = async (input: any, init?: any) => {
      if (input && typeof input === 'object' && !(input instanceof URL) && typeof input.url === 'string' && typeof input.arrayBuffer === 'function') {
        const r = input as Request;
        const body = r.method === 'GET' || r.method === 'HEAD' ? undefined : await r.arrayBuffer();
        return ufetch(r.url, { method: r.method, headers: Array.from(r.headers as any), body, redirect: r.redirect, signal: r.signal, ...(init || {}) } as any);
      }
      return ufetch(input, init);
    };
    console.log(`[api] YouTube через прокси ${u.host}`);
  } catch (e) {
    console.log('[api] прокси для YouTube не подключился:', (e as Error).message);
  }
}
