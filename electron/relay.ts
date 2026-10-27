import { net, session } from 'electron';
import { connect } from 'node:net';
import { X509Certificate } from 'node:crypto';
import { RELAY_DEFAULT } from '../shared/config';
import { mainSettings } from './store';

/**
 * Сервер Lull Relay (Нидерланды). Когда включён, плеер ходит в YouTube, SoundCloud и за текстами
 * через него: так он работает там, где YouTube замедлен, а SoundCloud заблокирован, и ссылки на звук
 * получаются быстрее (на сервере yt-dlp постоянно «прогрет», готовые ссылки общие для всех).
 *
 * Подключение задаётся строкой lull://КЛЮЧ@АДРЕС:ПОРТ#ОТПЕЧАТОК — её печатает скрипт установки.
 * Сертификат сервера самоподписанный, поэтому проверяем его по отпечатку SHA-256.
 */
export interface RelayConf {
  base: string;
  host: string;
  key: string;
  fp: string;
}

let cached: { raw: string; conf: RelayConf | null } | null = null;

export function parseRelay(raw: string): RelayConf | null {
  const m = raw.trim().match(/^lull:\/\/([^@]+)@([^:#/]+):(\d+)#([0-9a-fA-F:]{64,95})$/);
  if (!m) return null;
  return { key: m[1], host: m[2], base: `https://${m[2]}:${m[3]}`, fp: m[4].replace(/:/g, '').toLowerCase() };
}

export function relayConf(): RelayConf | null {
  const s = mainSettings() as { relay?: string; relayOn?: boolean };
  if (s.relayOn === false) return null;
  const raw = s.relay?.trim() || RELAY_DEFAULT;
  if (!raw) return null;
  if (cached?.raw !== raw) cached = { raw, conf: parseRelay(raw) };
  return cached.conf;
}

export const relayOn = () => !!relayConf() && relayUp();

/** Сайты, которые ходят через сервер (остальное — напрямую). */
const VIA = ['youtube.com', 'youtubei.googleapis.com', 'googlevideo.com', 'ytimg.com', 'ggpht.com', 'googleusercontent.com', 'soundcloud.com', 'sndcdn.com', 'lrclib.net', 'betterlyrics.org', 'google.com', 'googleapis.com', 'gstatic.com'];
export function goesViaRelay(url: string): boolean {
  if (!relayOn()) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return VIA.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Пинним самоподписанный сертификат сервера по отпечатку; для остальных сайтов — обычная проверка. */
export function installRelayCertCheck() {
  const proc = (req: Electron.Request, cb: (code: number) => void) => {
    const c = testing && req.hostname === testing.host ? testing : relayConf();
    if (c && req.hostname === c.host) {
      // Считаем SHA-256 от DER самого сертификата — так же, как openssl в скрипте установки
      let hex = '';
      try {
        hex = new X509Certificate(req.certificate.data).fingerprint256.replace(/:/g, '').toLowerCase();
      } catch {
        /* ниже — запасной вариант */
      }
      if (hex !== c.fp) {
        try {
          hex = Buffer.from(req.certificate.fingerprint.replace(/^sha256\//, ''), 'base64').toString('hex');
        } catch {
          /* ignore */
        }
      }
      if (hex !== c.fp) console.warn(`[relay] отпечаток сертификата не совпал: ${hex.slice(0, 16)}… ≠ ${c.fp.slice(0, 16)}…`);
      return cb(hex === c.fp ? 0 : -2);
    }
    cb(-3);
  };
  session.defaultSession.setCertificateVerifyProc(proc);
}

/**
 * Сервер не отвечает — на минуту идём напрямую, чтобы приложение не вставало целиком.
 */
let relayDownUntil = 0;
export function markRelayDown(e: unknown) {
  if (Date.now() < relayDownUntil) return;
  relayDownUntil = Date.now() + 60_000;
  console.warn(`[relay] сервер недоступен (${(e as Error)?.message ?? e}) — минуту работаю напрямую`);
}
const relayUp = () => Date.now() >= relayDownUntil;

/** Запрос к серверу (его собственные эндпоинты). */
export function relayApi(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  const c = relayConf();
  if (!c) return Promise.reject(new Error('Сервер Lull не настроен'));
  const headers = new Headers(init.headers as HeadersInit);
  headers.set('X-Lull-Key', c.key);
  return net.fetch(`${c.base}${pathAndQuery}`, { ...(init as any), headers }) as unknown as Promise<Response>;
}

/**
 * fetch для внешних сайтов: через сервер, если он включён и сайт в списке, иначе напрямую.
 * direct: true — всегда напрямую (ссылки на звук, полученные с компьютера пользователя,
 * привязаны к его адресу и через сервер не откроются).
 */
export async function xfetch(input: string | URL | Request, init: RequestInit & { direct?: boolean } = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const { direct, ...rest } = init;
  if (direct || !goesViaRelay(url)) return net.fetch(input as any, rest as any) as unknown as Promise<Response>;
  const req = input instanceof Request ? input : null;
  const headers = new Headers((rest.headers ?? req?.headers) as HeadersInit);
  const method = rest.method ?? req?.method ?? 'GET';
  let body: BodyInit | undefined = rest.body ?? undefined;
  if (body === undefined && req && method !== 'GET' && method !== 'HEAD') body = await req.text();
  if (body instanceof ReadableStream) body = await new Response(body).text();
  // Заголовки исходного запроса упаковываем в один X-Lull-H: Cookie/Origin/Referer/User-Agent
  // Chromium не даёт выставить на запрос к серверу — из-за этого запрос падал с ERR_FAILED
  const packed: Record<string, string> = {};
  headers.forEach((v, k) => (packed[k] = v));
  const outer: Record<string, string> = { 'X-Lull-H': Buffer.from(JSON.stringify(packed)).toString('base64') };
  try {
    return await relayApi(`/f?u=${encodeURIComponent(url)}`, { method, headers: outer, body });
  } catch (e) {
    markRelayDown(e);
    return net.fetch(url, { method, headers, body } as any) as unknown as Promise<Response>;
  }
}

/** Проверка связи с сервером: задержка в мс и версия yt-dlp на нём. raw — проверить строку до сохранения. */
let testing: RelayConf | null = null;
export async function relayHealth(raw?: string): Promise<{ ok: boolean; ms: number; detail: string }> {
  const c = raw ? parseRelay(raw) : relayConf();
  if (!c) return { ok: false, ms: 0, detail: raw ? 'Неверная строка подключения' : 'Сервер не настроен' };
  const t0 = Date.now();
  testing = c;
  try {
    const r = await net.fetch(`${c.base}/health`);
    const j = (await r.json()) as { ok?: boolean; yt_dlp?: string; cached?: number };
    return { ok: !!j.ok, ms: Date.now() - t0, detail: `yt-dlp ${j.yt_dlp ?? '?'} · ссылок в кэше ${j.cached ?? 0}` };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: String((e as Error).message) };
  } finally {
    testing = null;
  }
}

/**
 * Системный прокси (VPN-клиент) включён в настройках Windows, но сам VPN выключен — тогда
 * ни один запрос не проходит («ERR_PROXY_CONNECTION_FAILED»). Проверяем раз в минуту:
 * прокси не отвечает — идём напрямую; заработал снова — возвращаемся к системным настройкам.
 */
let proxyDead = false;
export const isProxyDead = () => proxyDead;
export async function healProxy() {
  try {
    if (proxyDead) await session.defaultSession.setProxy({ mode: 'system' });
    const p = await session.defaultSession.resolveProxy('https://www.youtube.com');
    const m = p.match(/(?:PROXY|HTTPS|SOCKS5?)\s+([^:;\s]+):(\d+)/i);
    if (!m) {
      proxyDead = false;
      return;
    }
    const alive = await new Promise<boolean>((res) => {
      const sock = connect({ host: m[1], port: Number(m[2]) });
      const done = (ok: boolean) => (sock.destroy(), res(ok));
      sock.setTimeout(1500, () => done(false));
      sock.once('connect', () => done(true));
      sock.once('error', () => done(false));
    });
    if (alive !== !proxyDead) console.log(alive ? `[net] системный прокси ${m[1]}:${m[2]} снова работает` : `[net] системный прокси ${m[1]}:${m[2]} не отвечает (VPN выключен?) — иду напрямую`);
    proxyDead = !alive;
    if (proxyDead) await session.defaultSession.setProxy({ mode: 'direct' });
  } catch {
    /* не критично */
  }
}
